import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { RemoteAccessError, errorMessage } from './errors.js';
import { doorEndpoint, findKnownTailcat, tailcatKeyPath } from './paths.js';
import {
  buildGenkeyArgs,
  buildServeArgs,
  parseAccessLine,
  parseAddressLine,
  parseRegionLine,
  sanitizeLine,
} from './parse.js';

const MAX_RECENT = 20;
const MAX_STDERR_LINES = 40;
const MAX_CONNECTIONS = 200;
const STABLE_AFTER_MS = 60_000;

/**
 * Supervises one tailcat server process, its saved key, its allow-list, and
 * the recent access records parsed from `--log`.
 */
export class TailcatSupervisor {
  /**
   * @param {object} ctx - Host plugin context.
   * @param {ReturnType<import('./config.js').resolveConfig>} config - resolved config.
   * @param {{ devices: ReturnType<import('./devices.js').createDeviceStore>, logger: any, installer?: import('./installer.js').TailcatInstaller }} options - collaborators.
   */
  constructor(ctx, config, { devices, logger, installer }) {
    this.ctx = ctx;
    this.config = config;
    this.devices = devices;
    this.logger = logger;
    this.installer = installer;
    this.events = new EventEmitter();
    this.events.setMaxListeners(50);

    this.phase = 'stopped';
    this.desired = false;
    this.address = null;
    this.keyMode = config.addressMode === 'ephemeral' ? 'ephemeral' : 'saved';
    this.keyFile = null;
    this.region = null;
    this.binary = { requested: config.binaryPath, resolved: null, source: null, version: null, error: null };
    this.restarts = 0;
    this.lastError = null;
    this.lastExit = null;
    this.warnings = [];
    this.recent = [];
    this.refusals = 0;
    this.startedAt = null;
    this.onlineAt = null;
    this.nextRestartAt = null;

    this.handle = null;
    this.streams = [];
    this.abort = null;
    this.generation = 0;
    this.startPromise = null;
    this.restartTimer = null;
    this.stableTimer = null;
    this.restartAttempt = 0;
    this.openConnections = new Map();
    this.stderrLines = [];
    this.disposing = false;
    this.versionPromise = null;
  }

  /** Set the desired state to running and start when idle. */
  async start() {
    if (this.disposing) throw new RemoteAccessError('disposed', 'The remote-access runtime is shutting down.');
    this.desired = true;
    if (this.handle) return this.snapshot();
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.startInternal().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  /** Stop the child and leave the runtime stopped (the door stays listening). */
  async stop() {
    this.desired = false;
    this.clearRestartTimer();
    const handle = this.handle;
    if (!handle) {
      this.phase = 'stopped';
      this.address = null;
      this.onlineAt = null;
      this.nextRestartAt = null;
      this.lastError = null;
      this.emit();
      return;
    }
    this.phase = 'stopping';
    this.emit();
    handle.terminate();
    try {
      await handle.waitForExit(AbortSignal.timeout(8_000));
    } catch (error) {
      this.logger.warn(`tailcat-remote: failed while waiting for tailcat to stop: ${errorMessage(error)}`);
    }
    this.closeStreams();
    if (this.phase !== 'stopped') {
      this.phase = 'stopped';
      this.address = null;
      this.onlineAt = null;
      this.nextRestartAt = null;
      this.lastError = null;
      this.emit();
    }
  }

  /** Stop and start again with the same saved key and allow-list. */
  async restart() {
    await this.stop();
    await this.start();
    return this.snapshot();
  }

  /**
   * Replace the saved stable key (or mint a new ephemeral key) and restart.
   * The old tailcat address stops working when the new server starts.
   */
  async rotate() {
    await this.stop();
    this.restartAttempt = 0;
    if (this.config.addressMode === 'stable') {
      try {
        await this.runGenkey(true);
      } catch (error) {
        this.phase = 'error';
        this.lastError = errorMessage(error);
        this.desired = false;
        this.emit();
        throw error;
      }
    }
    await this.start();
    await this.waitForOnline(30_000);
    return this.snapshot();
  }

  /** Release the child process and listeners for plugin unload. */
  async dispose() {
    this.disposing = true;
    this.desired = false;
    this.clearRestartTimer();
    if (this.stableTimer) clearTimeout(this.stableTimer);
    this.stableTimer = null;
    const handle = this.handle;
    if (handle) {
      handle.terminate();
      try {
        await handle.waitForExit(AbortSignal.timeout(8_000));
      } catch {
        // The provider's terminate escalation owns the final cleanup.
      }
      this.closeStreams();
    }
    this.phase = 'stopped';
    this.address = null;
    this.events.removeAllListeners();
  }

  /** @returns {object} display-safe state, including the address for the owner. */
  snapshot() {
    const endpoint = doorEndpoint(this.config);
    return {
      phase: this.phase,
      desired: this.desired,
      address: this.address,
      keyMode: this.keyMode,
      keyName: this.config.keyName,
      addressMode: this.config.addressMode,
      port: this.config.port,
      listen: this.config.listen,
      endpoint,
      region: this.region,
      binary: {
        requested: this.binary.requested,
        resolved: this.binary.resolved,
        source: this.binary.source,
        version: this.binary.version,
        error: this.binary.error,
      },
      restarts: this.restarts,
      lastError: this.lastError,
      lastExit: this.lastExit,
      warnings: [...this.warnings],
      stderrTail: this.stderrLines.slice(-10),
      recent: [...this.recent],
      refusals: this.refusals,
      startedAt: this.startedAt,
      onlineAt: this.onlineAt,
      nextRestartAt: this.nextRestartAt,
    };
  }

  /**
   * Wait for the tunnel to report an address (or to fail).
   * @param {number} timeoutMs - bound.
   * @returns {Promise<boolean>} whether the tunnel is online.
   */
  waitForOnline(timeoutMs) {
    if (this.phase === 'online') return Promise.resolve(true);
    if (this.phase === 'error' || this.phase === 'stopped') return Promise.resolve(false);
    return new Promise((resolve) => {
      let timer;
      const check = () => {
        if (this.phase === 'online') {
          cleanup();
          resolve(true);
        } else if (this.phase === 'error' || this.phase === 'stopped') {
          cleanup();
          resolve(false);
        }
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.events.off('change', check);
      };
      timer = setTimeout(() => {
        cleanup();
        resolve(this.phase === 'online');
      }, Math.max(0, timeoutMs));
      timer.unref?.();
      this.events.on('change', check);
      check();
    });
  }

  /** @returns {void} */
  emit() {
    this.events.emit('change');
  }

  /** @private */
  async startInternal() {
    if (this.handle) return this.snapshot();
    this.phase = 'starting';
    this.lastError = null;
    this.nextRestartAt = null;
    this.emit();
    try {
      await this.ensureBinary();
      if (!this.desired || this.disposing) {
        this.phase = 'stopped';
        this.emit();
        return this.snapshot();
      }
      if (this.config.addressMode === 'stable') await this.ensureKey();
      if (!this.desired || this.disposing) {
        this.phase = 'stopped';
        this.emit();
        return this.snapshot();
      }
      this.spawnServer();
      return this.snapshot();
    } catch (error) {
      this.phase = 'error';
      this.lastError = errorMessage(error);
      this.binary.error = this.binary.resolved === null ? this.lastError : this.binary.error;
      this.emit();
      throw error;
    }
  }

  /** Forget the resolved executable so the next start picks up an install. */
  reloadBinary() {
    this.binary.resolved = null;
    this.binary.source = null;
    this.binary.version = null;
    this.binary.error = null;
    this.versionPromise = null;
  }

  /** @private */
  async ensureBinary() {
    if (this.binary.resolved) return;
    const requested = this.config.binaryPath;
    const managed = this.installer?.binaryPath;
    if (requested === 'tailcat' && managed && this.installer?.hasInstalled()) {
      this.binary.resolved = managed;
      this.binary.source = 'managed';
      this.binary.error = null;
      this.logger.info(`tailcat-remote: using managed tailcat at ${managed}`);
      void this.loadVersion();
      return;
    }
    if (requested === 'tailcat' && this.installer?.system?.compatible === false) {
      throw new RemoteAccessError(
        'tailcat-version-too-old',
        `The installed tailcat ${this.installer.system.version ?? ''} is too old for the Unix-socket door; install the managed version from Remote Access or upgrade tailcat to 0.8.0 or newer.`,
        503,
      );
    }
    try {
      let resolved = null;
      try {
        resolved = await this.ctx.subprocess.resolveExecutable(requested, process.env);
      } catch (error) {
        if (requested !== 'tailcat') throw error;
        resolved =
          this.installer?.system?.status === 'found' ? this.installer.system.path : findKnownTailcat(process.platform);
        if (!resolved) throw error;
      }
      this.binary.resolved = resolved;
      this.binary.source = requested === 'tailcat' ? 'path' : 'config';
      this.binary.error = null;
      this.logger.info(`tailcat-remote: using ${resolved}`);
    } catch (error) {
      this.binary.error = errorMessage(error);
      throw new RemoteAccessError(
        'tailcat-not-found',
        `Cannot find the tailcat executable "${requested}". Use the install button in Remote Access, put tailcat on PATH, or set binaryPath in the plugin config. (${errorMessage(error)})`,
        503,
      );
    }
    void this.loadVersion();
  }

  /** @private */
  loadVersion() {
    if (this.versionPromise) return this.versionPromise;
    this.versionPromise = (async () => {
      try {
        const result = await this.runCollect([this.binary.resolved, 'version'], 15_000);
        const match = /v?(\d+\.\d+\.\d+)/.exec(`${result.stdout}\n${result.stderr}`);
        if (match) this.binary.version = match[0].startsWith('v') ? match[0] : `v${match[0]}`;
      } catch {
        // A version probe is diagnostic only; serving can still work.
      }
      this.emit();
    })();
    return this.versionPromise;
  }

  /** @private */
  async ensureKey() {
    this.keyFile = tailcatKeyPath(this.config.keyName);
    if (fs.existsSync(this.keyFile)) return;
    await this.runGenkey(false);
    if (!fs.existsSync(this.keyFile)) {
      throw new RemoteAccessError('key-not-created', `tailcat genkey did not create ${this.keyFile}.`, 500);
    }
  }

  /**
   * @private
   * @param {boolean} force - overwrite an existing saved key.
   */
  async runGenkey(force) {
    const argv = buildGenkeyArgs({
      binaryPath: this.binary.resolved ?? this.config.binaryPath,
      keyName: this.config.keyName,
      derpMapUrl: this.config.derpMapUrl,
      force,
    });
    this.logger.info(`tailcat-remote: ${force ? 'rotating' : 'creating'} the saved tailcat key`);
    await this.runCollect(argv, 120_000);
    this.keyFile = tailcatKeyPath(this.config.keyName);
    this.logger.info('tailcat-remote: saved key ready');
  }

  /** @private */
  spawnServer() {
    const endpoint = doorEndpoint(this.config);
    if (endpoint.mode === 'socket' && !fs.existsSync(endpoint.socketPath)) {
      throw new RemoteAccessError(
        'door-socket-missing',
        `The door socket ${endpoint.socketPath} does not exist. tailcat cannot start until the door is listening.`,
        503,
      );
    }
    const allow = this.devices.snapshot().allow;
    const argv = buildServeArgs({
      binaryPath: this.binary.resolved ?? this.config.binaryPath,
      port: this.config.port,
      listen: this.config.listen,
      socketPath: endpoint.mode === 'socket' ? endpoint.socketPath : '',
      keyName: this.config.keyName,
      addressMode: this.config.addressMode,
      allow,
      derpMapUrl: this.config.derpMapUrl,
      logAccess: this.config.logAccess,
    });
    const controller = new AbortController();
    let handle;
    try {
      handle = this.ctx.subprocess.spawn({
        argv,
        cwd: os.homedir(),
        env: childEnv(),
        stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
        graceMs: 5_000,
        signal: controller.signal,
      });
    } catch (error) {
      throw new RemoteAccessError('tailcat-spawn-failed', `Could not start tailcat: ${errorMessage(error)}`, 503);
    }

    this.closeStreams();
    this.handle = handle;
    this.abort = controller;
    this.phase = 'starting';
    this.address = null;
    this.onlineAt = null;
    this.lastExit = null;
    this.lastError = null;
    this.startedAt = new Date().toISOString();
    this.keyMode = this.config.addressMode === 'ephemeral' ? 'ephemeral' : 'saved';
    this.stderrLines = [];
    this.openConnections.clear();
    const generation = ++this.generation;
    this.logger.info(
      `tailcat-remote: started tailcat on ${endpoint.mode === 'socket' ? endpoint.socketPath : `127.0.0.1:${endpoint.port}`} (${allow.length > 0 ? `${allow.length} allowed device(s)` : 'address-only'})`,
    );

    if (handle.stdout) {
      const output = readline.createInterface({ input: handle.stdout, crlfDelay: Infinity });
      output.on('line', (line) => this.onStdout(generation, line));
      this.streams.push(output);
    }
    if (handle.stderr) {
      const errors = readline.createInterface({ input: handle.stderr, crlfDelay: Infinity });
      errors.on('line', (line) => this.onStderr(generation, line));
      this.streams.push(errors);
    }
    handle.done.then(
      (outcome) => this.onExit(generation, outcome),
      (error) => this.onExit(generation, { error }),
    );
    this.emit();
  }

  /** @private */
  onStdout(generation, line) {
    if (generation !== this.generation) return;
    const text = line.trim();
    if (!text) return;
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      return;
    }
    if (typeof payload?.listenAddr === 'string' && payload.listenAddr.startsWith('tc')) {
      this.markOnline(payload.listenAddr, this.config.addressMode === 'ephemeral' ? 'ephemeral' : 'saved');
    }
  }

  /** @private */
  onStderr(generation, line) {
    if (generation !== this.generation) return;
    const text = line.trim();
    if (!text) return;
    this.stderrLines.push(sanitizeLine(text));
    if (this.stderrLines.length > MAX_STDERR_LINES) this.stderrLines.shift();

    const region = parseRegionLine(text);
    if (region) {
      this.region = region;
      this.emit();
    }

    const address = parseAddressLine(text);
    if (address) this.markOnline(address.address, address.mode);

    if (text.includes('⚠️')) {
      const warning = sanitizeLine(text.replace(/^#\s*/, ''));
      this.warnings.push(warning);
      if (this.warnings.length > 4) this.warnings.shift();
      this.emit();
    }

    const record = parseAccessLine(text);
    if (!record) return;
    if (record.kind === 'peer' && record.decision === 'refused') {
      this.refusals += 1;
      this.pushRecent({
        kind: 'refused',
        at: new Date().toISOString(),
        peer: record.peer,
        reason: record.reason,
      });
      return;
    }
    if (record.kind !== 'connection') return;
    if (record.event === 'refused') {
      this.pushRecent({
        kind: 'refused',
        at: new Date().toISOString(),
        peer: null,
        reason: 'port-not-served',
        protocol: record.protocol,
        port: record.port,
        service: record.service,
      });
      return;
    }
    if (record.event === 'open') {
      const key = `${record.peer}|${record.protocol}|${record.port}`;
      if (this.openConnections.size > MAX_CONNECTIONS) this.openConnections.clear();
      this.openConnections.set(key, { at: Date.now(), via: record.via });
      return;
    }
    if (record.event === 'close') {
      const key = `${record.peer}|${record.protocol}|${record.port}`;
      const opened = this.openConnections.get(key);
      this.openConnections.delete(key);
      this.pushRecent({
        kind: 'connection',
        at: new Date().toISOString(),
        peer: record.peer,
        protocol: record.protocol,
        port: record.port,
        service: record.service,
        via: opened?.via ?? record.via ?? 'unknown',
        durationMs: record.durationMs ?? (opened ? Date.now() - opened.at : null),
      });
    }
  }

  /**
   * @private
   * @param {string} address - tailcat server address.
   * @param {'saved' | 'ephemeral'} mode - key provenance.
   */
  markOnline(address, mode) {
    const changed = this.address !== address;
    this.address = address;
    this.keyMode = mode;
    this.lastError = null;
    this.phase = 'online';
    this.onlineAt = new Date().toISOString();
    if (this.stableTimer) clearTimeout(this.stableTimer);
    this.stableTimer = setTimeout(() => {
      this.restartAttempt = 0;
      this.stableTimer = null;
    }, STABLE_AFTER_MS);
    this.stableTimer.unref?.();
    if (changed) this.logger.info('tailcat-remote: tunnel is online');
    this.emit();
  }

  /** @private */
  pushRecent(entry) {
    this.recent.unshift(entry);
    if (this.recent.length > MAX_RECENT) this.recent.length = MAX_RECENT;
    this.emit();
  }

  /** @private */
  onExit(generation, outcome) {
    if (generation !== this.generation) return;
    this.closeStreams();
    this.handle = null;
    this.abort = null;
    if (this.stableTimer) {
      clearTimeout(this.stableTimer);
      this.stableTimer = null;
    }
    const desired = this.desired && !this.disposing;
    this.address = null;
    this.onlineAt = null;
    this.nextRestartAt = null;
    if (!desired) {
      this.phase = 'stopped';
      this.lastError = null;
      this.emit();
      return;
    }
    const exit = outcome && 'exitCode' in outcome ? outcome : null;
    const failure = outcome?.error ? errorMessage(outcome.error) : null;
    const detail = failure ?? lastFailureLine(this.stderrLines);
    const code = exit?.exitCode;
    const signal = exit?.signal;
    const exitText =
      code !== undefined && code !== null
        ? `tailcat exited with code ${code}`
        : signal
          ? `tailcat was terminated by ${signal}`
          : 'tailcat exited';
    this.lastExit = { code: code ?? null, signal: signal ?? null, at: new Date().toISOString() };
    this.lastError = detail ? `${exitText}: ${detail}` : exitText;
    this.phase = 'error';
    this.emit();
    if (!this.config.restartEnabled || this.restartAttempt >= this.config.maxRestartAttempts) {
      this.logger.warn(`tailcat-remote: ${this.lastError}`);
      return;
    }
    this.restartAttempt += 1;
    this.restarts += 1;
    const delay = Math.min(
      this.config.restartBaseDelayMs * 2 ** (this.restartAttempt - 1),
      this.config.restartMaxDelayMs,
    );
    this.phase = 'restarting';
    this.nextRestartAt = new Date(Date.now() + delay).toISOString();
    this.logger.warn(`tailcat-remote: ${this.lastError}; retrying in ${delay} ms (attempt ${this.restartAttempt})`);
    this.emit();
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.nextRestartAt = null;
      if (!this.desired || this.disposing) return;
      this.start().catch((error) => {
        this.phase = 'error';
        this.lastError = errorMessage(error);
        this.emit();
      });
    }, delay);
    this.restartTimer.unref?.();
  }

  /** @private */
  clearRestartTimer() {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  /** @private */
  closeStreams() {
    for (const stream of this.streams) stream.close();
    this.streams = [];
  }

  /**
   * @private
   * @param {string[]} argv - executable and arguments.
   * @param {number} timeoutMs - bound for the whole exchange.
   * @returns {Promise<{ stdout: string, stderr: string, exitCode: number | null, signal: NodeJS.Signals | null }>}
   */
  async runCollect(argv, timeoutMs) {
    let handle;
    try {
      handle = this.ctx.subprocess.spawn({
        argv,
        cwd: os.homedir(),
        env: childEnv(),
        stdio: {
          stdin: 'ignore',
          stdout: { maxBytes: 64 * 1024 },
          stderr: { maxBytes: 64 * 1024 },
        },
        graceMs: 5_000,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new RemoteAccessError('tailcat-spawn-failed', `Could not run ${path.basename(argv[0])}: ${errorMessage(error)}`, 503);
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
      const detail = lastFailureLine([stderr, stdout].filter(Boolean).join('\n'));
      throw new RemoteAccessError(
        'tailcat-command-failed',
        `${path.basename(argv[0])} exited with code ${outcome.exitCode ?? 'null'}${detail ? `: ${detail}` : ''}`,
        502,
      );
    }
    return { stdout, stderr, exitCode: outcome.exitCode, signal: outcome.signal };
  }
}

/** Environment needed by tailcat's key path and DERP cache discovery. */
function childEnv() {
  const env = { HOME: os.homedir() };
  for (const name of ['XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME']) {
    const value = process.env[name];
    if (value) env[name] = value;
  }
  return env;
}

/**
 * Choose the most useful diagnostic line from captured stderr.
 * @param {string[]} lines - already sanitized lines.
 * @returns {string | null} last meaningful line.
 */
function lastFailureLine(lines) {
  const list = Array.isArray(lines) ? lines : String(lines).split(/\r?\n/);
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const line = list[index].trim();
    if (!line) continue;
    if (line.startsWith('[peer]') || line.startsWith('[conn]')) continue;
    if (line.includes('Server listening with')) continue;
    return line;
  }
  return null;
}
