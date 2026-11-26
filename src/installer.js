import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { RemoteAccessError, errorMessage } from './errors.js';
import { dataDir, findKnownTailcat, managedBinaryDir, managedBinaryPath } from './paths.js';

/** The upstream tailcat build this plugin knows how to install. */
export const TAILCAT_VERSION = '0.8.0';
export const TAILCAT_TAG = 'v0.8.0';
export const UPSTREAM_RELEASES = `https://github.com/tailscale/tailcat/releases/download/${TAILCAT_TAG}`;
export const MANUAL_INSTALL_URL = 'https://github.com/tailscale/tailcat#install';
/** Minimum tailcat release: Unix-socket serve targets arrived in 0.8.0. */
export const MIN_TAILCAT_VERSION = '0.8.0';

const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
const MAX_TEXT_BYTES = 512 * 1024;
const COMMAND_TIMEOUT_MS = 180_000;
const BREW_TIMEOUT_MS = 30 * 60_000;
const METADATA_FILE = 'tailcat.json';

/**
 * One installable target. `archive` downloads an upstream release archive;
 * `brew` delegates to Homebrew because tailcat does not publish macOS static
 * binaries. `unsupported` still carries the manual instructions.
 * @typedef {{kind: 'archive', os: string, arch: string, asset: string, format: 'tar.gz'|'zip', binary: string, source: 'upstream', assetUrl: string, checksumsUrl: string}
 *   | {kind: 'brew', os: string, arch: string, binary: string, source: 'homebrew', formula: string, command: string}
 *   | {kind: 'unsupported', os: string, arch: string}} PlatformSpec
 */

/**
 * Map Node's `process.platform`/`process.arch` to a tailcat distribution
 * target. Kept pure so the panel and tests can describe the platform without
 * starting a download.
 * @param {string} [platform] - Node platform, defaults to the Host's.
 * @param {string} [arch] - Node architecture, defaults to the Host's.
 * @returns {PlatformSpec} install target.
 */
export function platformSpec(platform = process.platform, arch = process.arch) {
  const key = `${platform}:${arch}`;
  /** @type {Record<string, PlatformSpec>} */
  const specs = {
    'linux:x64': archiveSpec('linux', 'amd64', 'linux_amd64.tar.gz', 'tar.gz'),
    'linux:arm64': archiveSpec('linux', 'arm64', 'linux_arm64.tar.gz', 'tar.gz'),
    'linux:arm': archiveSpec('linux', 'armv7', 'linux_armv7.tar.gz', 'tar.gz'),
    'win32:x64': archiveSpec('windows', 'amd64', 'windows_amd64.zip', 'zip'),
    'win32:arm64': archiveSpec('windows', 'arm64', 'windows_arm64.zip', 'zip'),
    'darwin:x64': {
      kind: 'brew',
      os: 'darwin',
      arch: 'x64',
      binary: 'tailcat',
      source: 'homebrew',
      formula: 'tailcat',
      command: 'brew install tailcat',
    },
    'darwin:arm64': {
      kind: 'brew',
      os: 'darwin',
      arch: 'arm64',
      binary: 'tailcat',
      source: 'homebrew',
      formula: 'tailcat',
      command: 'brew install tailcat',
    },
  };
  return specs[key] ?? { kind: 'unsupported', os: platform, arch };
}

/**
 * @param {string} osName - archive OS.
 * @param {string} arch - archive architecture label.
 * @param {string} suffix - asset filename suffix.
 * @param {'tar.gz'|'zip'} format - archive format.
 * @returns {PlatformSpec} archive target.
 */
function archiveSpec(osName, arch, suffix, format) {
  const asset = `tailcat_${TAILCAT_VERSION}_${suffix}`;
  return {
    kind: 'archive',
    os: osName,
    arch,
    asset,
    format,
    binary: osName === 'windows' ? 'tailcat.exe' : 'tailcat',
    source: 'upstream',
    assetUrl: `${UPSTREAM_RELEASES}/${asset}`,
    checksumsUrl: `${UPSTREAM_RELEASES}/checksums.txt`,
  };
}

/**
 * Parse a release checksum manifest (sha256 + whitespace + filename).
 * @param {string} text - manifest contents.
 * @returns {Map<string, string>} filename to lowercase digest.
 */
export function parseChecksums(text) {
  const checksums = new Map();
  for (const line of String(text).split(/\r?\n/)) {
    const match = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line.trim());
    if (match) checksums.set(path.basename(match[2]), match[1].toLowerCase());
  }
  return checksums;
}

/**
 * @param {string} file - path to hash.
 * @returns {Promise<string>} lowercase sha256.
 */
export async function sha256File(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

/**
 * Parse a semantic version out of `tailcat version` output.
 * @param {string | null | undefined} value - version text.
 * @returns {[number, number, number] | null} numeric triple.
 */
export function versionParts(value) {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(String(value ?? ''));
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/**
 * @param {string | null | undefined} version - candidate.
 * @param {string} minimum - required semantic version.
 * @returns {boolean} whether candidate is at least minimum.
 */
export function versionAtLeast(version, minimum) {
  const left = versionParts(version);
  const right = versionParts(minimum);
  if (!left || !right) return false;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return true;
}

/**
 * Install and update the managed tailcat executable without modifying PATH.
 * Downloads are verified against the release checksum before extraction, and
 * the archive is staged under DSH_HOME before an atomic replace.
 *
 * Detection is deliberately separate from installation: a tailcat already
 * installed by the user stays in place and is used by the supervisor. The
 * managed copy is only created after an explicit install action.
 */
export class TailcatInstaller {
  /**
   * @param {object} ctx - Host plugin context.
   * @param {object} [options] - installer options.
   * @param {any} [options.logger] - Host logger.
   * @param {string} [options.releaseTag] - plugin release tag.
   * @param {string} [options.requestedBinary] - configured binaryPath (defaults to `tailcat`).
   * @param {typeof fetch} [options.fetchImpl] - fetch implementation.
   * @param {(name: string, env: NodeJS.ProcessEnv) => Promise<string>} [options.resolveExecutable] - executable resolver.
   * @param {(argv: string[], options: {timeoutMs?: number, env?: NodeJS.ProcessEnv, signal?: AbortSignal}) => Promise<{stdout: string, stderr: string, exitCode: number | null}>} [options.runCommand] - command runner.
   * @param {string} [options.platform] - Node platform override.
   * @param {string} [options.arch] - Node architecture override.
   * @param {{dataDir?: string, binaryDir?: string, binaryPath?: string, stagingRoot?: string}} [options.paths] - path overrides.
   */
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    this.logger = options.logger ?? ctx.logger;
    this.releaseTag = options.releaseTag ?? 'v0.0.0';
    this.requestedBinary = options.requestedBinary ?? 'tailcat';
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.platform = options.platform ?? process.platform;
    this.arch = options.arch ?? process.arch;
    this.spec = platformSpec(this.platform, this.arch);
    this.dataDir = options.paths?.dataDir ?? dataDir();
    this.binaryDir = options.paths?.binaryDir ?? managedBinaryDir();
    this.binaryPath = options.paths?.binaryPath ?? managedBinaryPath(this.platform);
    this.metadataPath = path.join(this.binaryDir, METADATA_FILE);
    this.stagingRoot = options.paths?.stagingRoot ?? path.join(this.dataDir, '.install');
    this.resolveExecutable =
      options.resolveExecutable ?? ((name, env) => this.ctx.subprocess.resolveExecutable(name, env));
    this.runCommand = options.runCommand ?? ((argv, runOptions) => this.runInHost(argv, runOptions));

    this.phase = 'idle';
    this.busy = false;
    this.progress = null;
    this.lastError = null;
    this.installedAt = null;
    this.promise = null;
    this.abort = null;
    this.disposed = false;
    this.system = null;
    this.systemPromise = null;
  }

  /** @returns {object} display-safe installer state. */
  snapshot() {
    const installed = this.readInstalled();
    return {
      supported: this.spec.kind !== 'unsupported',
      method: this.spec.kind === 'unsupported' ? null : this.spec.kind,
      platform: this.platform,
      arch: this.arch,
      version: TAILCAT_VERSION,
      installed: installed !== null,
      installedVersion: installed?.version ?? null,
      installedAt: installed?.installedAt ?? null,
      source: installed?.source ?? null,
      binaryPath: this.binaryPath,
      asset: this.spec.kind === 'archive' ? this.spec.asset : null,
      command: this.spec.kind === 'brew' ? this.spec.command : null,
      manualUrl: MANUAL_INSTALL_URL,
      busy: this.busy,
      phase: this.phase,
      progress: this.progress ? { ...this.progress } : null,
      error: this.lastError,
      system: this.system ? { ...this.system } : null,
    };
  }

  /** @returns {boolean} whether the plugin-managed executable is installed. */
  hasInstalled() {
    return this.readInstalled() !== null;
  }

  /**
   * Find a tailcat the user installed independently (PATH, Homebrew, an
   * explicit binaryPath, ...). This never downloads or writes anything.
   * @returns {Promise<object>} cached detection result.
   */
  detectSystem() {
    if (this.systemPromise) return this.systemPromise;
    this.system = { status: 'checking', path: null, version: null, checkedAt: null };
    this.systemPromise = this.detectSystemInternal()
      .catch((error) => {
        this.system = {
          status: 'missing',
          path: null,
          version: null,
          checkedAt: new Date().toISOString(),
          error: errorMessage(error),
        };
        return this.system;
      })
      .finally(() => {
        this.systemPromise = null;
      });
    return this.systemPromise;
  }

  /** @private */
  async detectSystemInternal() {
    let resolved = null;
    try {
      resolved = await this.resolveExecutable(this.requestedBinary, process.env);
    } catch {
      resolved = this.requestedBinary === 'tailcat' ? findKnownTailcat(this.platform) : null;
    }
    if (!resolved) {
      this.system = { status: 'missing', path: null, version: null, checkedAt: new Date().toISOString() };
      return this.system;
    }
    let version = null;
    try {
      const result = await this.runCommand([resolved, 'version'], { timeoutMs: 15_000 });
      const match = /v?(\d+\.\d+\.\d+)/.exec(`${result.stdout}\n${result.stderr}`);
      if (match) version = match[0].startsWith('v') ? match[0] : `v${match[0]}`;
    } catch {
      // A version probe is diagnostic only. A path that exists and runs as
      // an executable is still more useful than treating it as missing.
    }
    this.system = {
      status: 'found',
      path: resolved,
      version,
      compatible: version ? versionAtLeast(version, MIN_TAILCAT_VERSION) : null,
      checkedAt: new Date().toISOString(),
    };
    return this.system;
  }

  /**
   * Download, verify, and install the managed executable.
   * @param {{force?: boolean}} [options] - force reinstalls over an existing copy.
   * @returns {Promise<object>} installer snapshot after completion.
   */
  install(options = {}) {
    if (this.disposed) {
      return Promise.reject(new RemoteAccessError('disposed', 'The remote-access runtime is shutting down.', 503));
    }
    if (this.promise) return this.promise;
    if (!options.force && this.readInstalled() !== null) return Promise.resolve(this.snapshot());

    this.busy = true;
    this.phase = 'starting';
    this.progress = null;
    this.lastError = null;
    const controller = new AbortController();
    this.abort = controller;
    this.promise = this.installInternal(controller.signal)
      .catch((error) => {
        this.phase = 'error';
        this.lastError = errorMessage(error);
        throw error;
      })
      .finally(() => {
        this.busy = false;
        this.abort = null;
        this.promise = null;
      });
    return this.promise;
  }

  /** Stop an in-flight download when the plugin unloads. */
  dispose() {
    this.disposed = true;
    this.abort?.abort();
  }

  /** @private */
  async installInternal(signal) {
    if (this.spec.kind === 'unsupported') {
      throw new RemoteAccessError(
        'tailcat-platform-unsupported',
        `Automatic tailcat install is not available for ${this.platform}/${this.arch}. Install it manually from ${MANUAL_INSTALL_URL}, then put it on PATH or set binaryPath.`,
        400,
      );
    }
    await fsp.mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    await fsp.mkdir(this.binaryDir, { recursive: true, mode: 0o700 });
    await fsp.mkdir(this.stagingRoot, { recursive: true, mode: 0o700 });
    const staging = await fsp.mkdtemp(path.join(this.stagingRoot, 'run-'));
    try {
      const result =
        this.spec.kind === 'archive'
          ? await this.installArchive(staging, signal)
          : await this.installBrew(staging, signal);
      this.phase = 'done';
      this.progress = null;
      this.installedAt = result.installedAt;
      this.system = null;
      this.logger.info(`tailcat-remote: installed tailcat ${result.version ?? TAILCAT_VERSION} from ${result.source}`);
      return this.snapshot();
    } finally {
      await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** @private */
  async installArchive(staging, signal) {
    const spec = this.spec;
    if (spec.kind !== 'archive') throw new Error('not an archive target');
    this.phase = 'checksums';
    const manifest = await this.fetchText(spec.checksumsUrl, signal);
    const expected = parseChecksums(manifest).get(spec.asset);
    if (!expected) {
      throw new RemoteAccessError(
        'tailcat-checksum-missing',
        `The tailcat release checksums do not list ${spec.asset}. Refusing to install an unverified executable.`,
        502,
      );
    }

    const archivePath = path.join(staging, spec.asset);
    this.phase = 'downloading';
    this.progress = { phase: 'downloading', received: 0, total: 0, percent: null };
    await this.download(spec.assetUrl, archivePath, signal);
    if (signal.aborted) throw new RemoteAccessError('tailcat-install-aborted', 'The tailcat install was cancelled.', 503);

    this.phase = 'verifying';
    this.progress = null;
    const actual = await sha256File(archivePath);
    if (actual !== expected) {
      throw new RemoteAccessError(
        'tailcat-checksum-mismatch',
        `tailcat archive checksum mismatch: expected ${expected}, got ${actual}.`,
        502,
      );
    }

    const extracted = path.join(staging, 'extracted');
    this.phase = 'extracting';
    await fsp.mkdir(extracted, { recursive: true, mode: 0o700 });
    await this.extractArchive(archivePath, extracted, spec);
    const candidate = await findBinary(extracted, spec.binary);
    if (!candidate) {
      throw new RemoteAccessError('tailcat-archive-invalid', `The tailcat archive did not contain ${spec.binary}.`, 502);
    }

    this.phase = 'installing';
    const version = await this.probe(candidate);
    this.ensureCompatible(version);
    const installedAt = new Date().toISOString();
    await this.replaceBinary(candidate);
    await this.writeMetadata({
      version: version ?? TAILCAT_VERSION,
      source: 'upstream',
      asset: spec.asset,
      checksum: expected,
      installedAt,
      platform: this.platform,
      arch: this.arch,
    });
    return { version: version ?? TAILCAT_VERSION, source: 'upstream', installedAt };
  }

  /** @private */
  async installBrew(staging, signal) {
    if (this.spec.kind !== 'brew') throw new Error('not a Homebrew target');
    const brew = await this.findBrew();
    if (!brew) {
      throw new RemoteAccessError(
        'tailcat-brew-missing',
        `Homebrew was not found. Install Homebrew (https://brew.sh), then retry, or install tailcat manually from ${MANUAL_INSTALL_URL} and set binaryPath.`,
        503,
      );
    }
    this.phase = 'homebrew';
    this.progress = { phase: 'homebrew', received: 0, total: 0, percent: null };
    try {
      await this.runCommand([brew, 'update'], {
        timeoutMs: 10 * 60_000,
        env: {
          HOMEBREW_NO_INSTALL_CLEANUP: '1',
          NONINTERACTIVE: '1',
        },
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      this.logger.warn(`tailcat-remote: brew update failed, continuing with the local formula: ${errorMessage(error)}`);
    }
    const installArgs = this.system?.compatible === false ? ['upgrade', 'tailcat'] : ['install', 'tailcat'];
    try {
      await this.runCommand([brew, ...installArgs], {
        timeoutMs: BREW_TIMEOUT_MS,
        env: {
          HOMEBREW_NO_INSTALL_CLEANUP: '1',
          NONINTERACTIVE: '1',
        },
        signal,
      });
    } catch (error) {
      if (installArgs[0] !== 'upgrade' || signal.aborted) throw error;
      this.logger.warn(`tailcat-remote: brew upgrade failed, trying a fresh install: ${errorMessage(error)}`);
      await this.runCommand([brew, 'install', 'tailcat'], {
        timeoutMs: BREW_TIMEOUT_MS,
        env: {
          HOMEBREW_NO_INSTALL_CLEANUP: '1',
          NONINTERACTIVE: '1',
        },
        signal,
      });
    }
    const prefix = await this.runCommand([brew, '--prefix', 'tailcat'], {
      timeoutMs: COMMAND_TIMEOUT_MS,
      signal,
    }).catch(() => null);
    const candidates = [
      prefix?.stdout?.trim() ? path.join(prefix.stdout.trim(), 'bin', this.spec.binary) : null,
      path.join(path.dirname(brew), this.spec.binary),
    ].filter((value) => typeof value === 'string');
    const candidate = candidates.find((value) => isFile(value));
    if (!candidate) {
      throw new RemoteAccessError(
        'tailcat-brew-binary-missing',
        'Homebrew finished but did not leave a tailcat executable in its prefix. Check `brew install tailcat`, or set binaryPath.',
        502,
      );
    }
    const staged = path.join(staging, this.spec.binary);
    await fsp.copyFile(candidate, staged);
    const version = await this.probe(staged);
    this.ensureCompatible(version);
    const installedAt = new Date().toISOString();
    await this.replaceBinary(staged);
    await this.writeMetadata({
      version: version ?? TAILCAT_VERSION,
      source: 'homebrew',
      asset: null,
      checksum: null,
      installedAt,
      platform: this.platform,
      arch: this.arch,
    });
    return { version: version ?? TAILCAT_VERSION, source: 'homebrew', installedAt };
  }

  /** @private */
  async findBrew() {
    const common = this.platform === 'darwin' ? ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'] : [];
    for (const candidate of common) {
      if (isFile(candidate) && isExecutable(candidate)) return candidate;
    }
    try {
      return await this.resolveExecutable('brew', process.env);
    } catch {
      return null;
    }
  }

  /** @private */
  async download(url, destination, signal) {
    const response = await this.fetchImpl(url, {
      redirect: 'follow',
      signal,
      headers: {
        accept: 'application/octet-stream',
        'user-agent': `dsh-tailcat-remote/${this.releaseTag.replace(/^v/, '')}`,
      },
    });
    if (!response.ok || !response.body) {
      throw new RemoteAccessError('tailcat-download-failed', `Could not download ${url}: HTTP ${response.status}.`, 502);
    }
    const total = Number(response.headers.get('content-length')) || 0;
    if (total > MAX_ARCHIVE_BYTES) {
      throw new RemoteAccessError('tailcat-download-too-large', `The tailcat archive is larger than ${MAX_ARCHIVE_BYTES} bytes.`, 502);
    }
    let received = 0;
    this.progress = { phase: 'downloading', received: 0, total, percent: total > 0 ? 0 : null };
    const meter = new Transform({
      transform: (chunk, _encoding, callback) => {
        received += chunk.length;
        if (received > MAX_ARCHIVE_BYTES) {
          callback(new Error(`The tailcat archive is larger than ${MAX_ARCHIVE_BYTES} bytes.`));
          return;
        }
        this.progress = {
          phase: 'downloading',
          received,
          total,
          percent: total > 0 ? Math.min(100, Math.round((received / total) * 100)) : null,
        };
        callback(null, chunk);
      },
    });
    try {
      await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(destination, { mode: 0o600 }));
    } catch (error) {
      await fsp.rm(destination, { force: true }).catch(() => {});
      if (signal.aborted) throw new RemoteAccessError('tailcat-install-aborted', 'The tailcat install was cancelled.', 503);
      throw new RemoteAccessError('tailcat-download-failed', `Could not download ${url}: ${errorMessage(error)}`, 502);
    }
  }

  /** @private */
  async fetchText(url, signal) {
    const response = await this.fetchImpl(url, {
      redirect: 'follow',
      signal,
      headers: { accept: 'text/plain', 'user-agent': `dsh-tailcat-remote/${this.releaseTag.replace(/^v/, '')}` },
    });
    if (!response.ok) {
      throw new RemoteAccessError('tailcat-checksum-download-failed', `Could not download ${url}: HTTP ${response.status}.`, 502);
    }
    const length = Number(response.headers.get('content-length')) || 0;
    if (length > MAX_TEXT_BYTES) {
      throw new RemoteAccessError('tailcat-checksum-too-large', `The checksum manifest at ${url} is too large.`, 502);
    }
    const text = await response.text();
    if (text.length > MAX_TEXT_BYTES) {
      throw new RemoteAccessError('tailcat-checksum-too-large', `The checksum manifest at ${url} is too large.`, 502);
    }
    return text;
  }

  /** @private */
  async extractArchive(archive, destination, spec) {
    let tar = null;
    try {
      tar = await this.resolveExecutable('tar', process.env);
    } catch {
      if (spec.format !== 'zip' || this.platform !== 'win32') {
        throw new RemoteAccessError(
          'tailcat-extract-unavailable',
          'The system tar executable is unavailable; cannot extract the verified tailcat archive.',
          503,
        );
      }
    }
    if (!tar) {
      await this.extractZipWithPowerShell(archive, destination);
      return;
    }
    const args = spec.format === 'zip' ? ['-xf', archive, '-C', destination] : ['-xzf', archive, '-C', destination];
    try {
      await this.runCommand([tar, ...args], { timeoutMs: COMMAND_TIMEOUT_MS });
      if (await findBinary(destination, spec.binary)) return;
    } catch (error) {
      if (spec.format !== 'zip' || this.platform !== 'win32') throw error;
    }
    if (spec.format !== 'zip' || this.platform !== 'win32') {
      throw new RemoteAccessError('tailcat-archive-invalid', `The tailcat archive did not contain ${spec.binary}.`, 502);
    }
    await this.extractZipWithPowerShell(archive, destination);
  }

  /** @private */
  async extractZipWithPowerShell(archive, destination) {
    const powershell = await this.findWindowsPowerShell();
    if (!powershell) throw new RemoteAccessError('tailcat-extract-unavailable', 'Could not extract the tailcat zip archive.', 503);
    await this.runCommand([
      powershell,
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Expand-Archive -LiteralPath ${quotePowerShell(archive)} -DestinationPath ${quotePowerShell(destination)} -Force`,
    ], { timeoutMs: COMMAND_TIMEOUT_MS });
  }

  /** @private */
  async findWindowsPowerShell() {
    for (const name of ['powershell.exe', 'powershell']) {
      try {
        return await this.resolveExecutable(name, process.env);
      } catch {
        // Try the next spelling.
      }
    }
    return null;
  }

  /** @private */
  async probe(binary) {
    let result;
    try {
      result = await this.runCommand([binary, 'version'], { timeoutMs: 20_000 });
    } catch (error) {
      throw new RemoteAccessError('tailcat-install-invalid', `The installed tailcat could not run: ${errorMessage(error)}`, 502);
    }
    if (result.exitCode !== 0) {
      const detail = `${result.stderr}\n${result.stdout}`.trim().split(/\r?\n/).filter(Boolean).at(-1);
      throw new RemoteAccessError(
        'tailcat-install-invalid',
        `The installed tailcat exited with code ${result.exitCode}${detail ? `: ${detail}` : ''}.`,
        502,
      );
    }
    const match = /v?(\d+\.\d+\.\d+)/.exec(`${result.stdout}\n${result.stderr}`);
    return match ? (match[0].startsWith('v') ? match[0] : `v${match[0]}`) : null;
  }

  /** @private */
  ensureCompatible(version) {
    if (version && !versionAtLeast(version, MIN_TAILCAT_VERSION)) {
      throw new RemoteAccessError(
        'tailcat-version-too-old',
        `tailcat ${version} is too old for the Unix-socket door; ${MIN_TAILCAT_VERSION} or newer is required. Update tailcat and retry.`,
        503,
      );
    }
  }

  /** @private */
  async replaceBinary(source) {
    await fsp.chmod(source, 0o755).catch(() => {});
    const target = this.binaryPath;
    const backup = `${target}.previous`;
    await fsp.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await fsp.rm(backup, { force: true }).catch(() => {});
    const hadTarget = isFile(target);
    if (hadTarget) await fsp.rename(target, backup);
    try {
      await fsp.rename(source, target);
      await fsp.chmod(target, 0o755).catch(() => {});
    } catch (error) {
      if (hadTarget) await fsp.rename(backup, target).catch(() => {});
      throw new RemoteAccessError('tailcat-install-write-failed', `Could not install tailcat at ${target}: ${errorMessage(error)}`, 500);
    }
    await fsp.rm(backup, { force: true }).catch(() => {});
  }

  /** @private */
  async writeMetadata(metadata) {
    const temporary = `${this.metadataPath}.tmp-${process.pid}`;
    try {
      await fsp.writeFile(temporary, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
      await fsp.rename(temporary, this.metadataPath);
    } catch (error) {
      await fsp.rm(temporary, { force: true }).catch(() => {});
      this.logger.warn(`tailcat-remote: installed tailcat but could not save metadata: ${errorMessage(error)}`);
    }
  }

  /** @private */
  readInstalled() {
    try {
      if (!isRegularFile(this.binaryPath)) return null;
      if (this.platform !== 'win32' && !isExecutable(this.binaryPath)) return null;
      try {
        const metadata = JSON.parse(fs.readFileSync(this.metadataPath, 'utf8'));
        return { version: metadata.version ?? null, source: metadata.source ?? null, installedAt: metadata.installedAt ?? null };
      } catch {
        return { version: null, source: null, installedAt: null };
      }
    } catch {
      return null;
    }
  }

  /** @private */
  async runInHost(argv, options = {}) {
    let handle;
    try {
      handle = this.ctx.subprocess.spawn({
        argv,
        cwd: os.homedir(),
        env: { ...baseEnv(), ...options.env },
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: 128 * 1024 },
          stderr: { maxBytes: 128 * 1024 },
        },
        graceMs: 5_000,
        signal: options.signal
          ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? COMMAND_TIMEOUT_MS)])
          : AbortSignal.timeout(options.timeoutMs ?? COMMAND_TIMEOUT_MS),
      });
    } catch (error) {
      throw new RemoteAccessError('tailcat-command-failed', `Could not run ${path.basename(argv[0])}: ${errorMessage(error)}`, 503);
    }
    let outcome;
    try {
      outcome = await handle.done;
    } catch (error) {
      throw new RemoteAccessError('tailcat-command-failed', `${path.basename(argv[0])} failed: ${errorMessage(error)}`, 502);
    }
    const stdout = handle.collected.stdout?.readFrom(0).text ?? '';
    const stderr = handle.collected.stderr?.readFrom(0).text ?? '';
    if (outcome.exitCode !== 0) {
      const detail = lastLine(stderr) ?? lastLine(stdout);
      throw new RemoteAccessError(
        'tailcat-command-failed',
        `${path.basename(argv[0])} exited with code ${outcome.exitCode ?? 'null'}${detail ? `: ${detail}` : ''}`,
        502,
      );
    }
    return { stdout, stderr, exitCode: outcome.exitCode };
  }
}

/**
 * Environment for installer commands. It forwards PATH so Homebrew can find
 * its own helpers, and keeps only the non-secret XDG locations plus HOME.
 * @returns {NodeJS.ProcessEnv} child environment.
 */
function baseEnv() {
  const env = { HOME: os.homedir() };
  for (const name of ['PATH', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME']) {
    const value = process.env[name];
    if (value) env[name] = value;
  }
  return env;
}

/**
 * Find a binary in a staging directory, allowing one archive wrapper folder.
 * @param {string} root - extracted root.
 * @param {string} name - expected basename.
 * @returns {Promise<string | null>} absolute path.
 */
async function findBinary(root, name) {
  const direct = path.join(root, name);
  if (isRegularFile(direct)) return direct;
  const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const candidate = path.join(root, entry.name, name);
    if (isRegularFile(candidate)) return candidate;
  }
  return null;
}

/** @param {string} file - path. @returns {boolean} regular file that is not a symlink. */
function isRegularFile(file) {
  try {
    return fs.lstatSync(file).isFile();
  } catch {
    return false;
  }
}

/** @param {string} file - path. @returns {boolean} regular file. */
function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/** @param {string} file - path. @returns {boolean} executable file. */
function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** @param {string} value - PowerShell string. @returns {string} single-quoted literal. */
function quotePowerShell(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

/** @param {string} text - command output. @returns {string | null} last non-empty line. */
function lastLine(text) {
  const lines = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length > 0 ? lines[lines.length - 1] : null;
}
