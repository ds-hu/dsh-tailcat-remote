import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { tailcatKeyPath } from '../../src/paths.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TailcatInstaller } from '../../src/installer.js';

/**
 * CI-only smoke test for the managed installer. It uses the real GitHub
 * release, checksum verification, extraction, and binary probe on each
 * runner, and cleans up its throwaway DSH_HOME before exiting.
 */

const root = fs.mkdtempSync(path.join(process.cwd(), '.installer-smoke-'));
const logger = {
  info: (message) => console.log(`[installer] ${message}`),
  warn: (message) => console.warn(`[installer] ${message}`),
  error: (message) => console.error(`[installer] ${message}`),
};

/** Resolve executables the way the Host subprocess service does. */
function resolveExecutable(name) {
  if (name.includes('/') || name.includes('\\')) {
    return isExecutable(name) ? name : null;
  }
  const extensions = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = path.join(directory, `${name}${extension}`);
      if (isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

/** @param {string} file - path. @returns {boolean} whether it can be executed. */
function isExecutable(file) {
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

/**
 * Minimal subprocess adapter for the installer's injected runner. The
 * production path uses ctx.subprocess; this lets the smoke test exercise the
 * exact download/extract/install logic without booting a Harness profile.
 */
function runCommand(argv, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd: os.homedir(),
      env: { ...process.env, ...options.env },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = options.timeoutMs
      ? setTimeout(() => {
          if (settled) return;
          settled = true;
          child.kill('SIGKILL');
          reject(new Error(`${path.basename(argv[0])} timed out after ${options.timeoutMs} ms`));
        }, options.timeoutMs)
      : null;
    const abort = () => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`${path.basename(argv[0])} was aborted`));
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    child.stdout.on('data', (chunk) => {
      stdout = (stdout + chunk.toString()).slice(-128 * 1024);
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-128 * 1024);
    });
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      reject(error);
    });
    child.once('exit', (code, signal) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      if (code !== 0) {
        const detail = (stderr || stdout).trim().split(/\r?\n/).filter(Boolean).at(-1);
        reject(new Error(`${path.basename(argv[0])} exited with ${code ?? signal}${detail ? `: ${detail}` : ''}`));
        return;
      }
      resolve({ stdout, stderr, exitCode: code });
    });
  });
}

try {
  const installer = new TailcatInstaller(
    { logger },
    {
      logger,
      releaseTag: 'v0.1.1',
      requestedBinary: 'tailcat',
      resolveExecutable,
      runCommand,
      paths: {
        dataDir: root,
        binaryDir: path.join(root, 'bin'),
        binaryPath: path.join(root, 'bin', process.platform === 'win32' ? 'tailcat.exe' : 'tailcat'),
        stagingRoot: path.join(root, '.install'),
      },
    },
  );

  const system = await installer.detectSystem();
  console.log(`[installer] platform=${process.platform}/${process.arch} system=${JSON.stringify(system)}`);
  let binary;
  if (system.status === 'found') {
    assert.equal(typeof system.path, 'string');
    assert.notEqual(system.compatible, false, 'the preinstalled tailcat is too old for the door');
    binary = system.path;
    console.log('[installer] pre-existing tailcat detected; the managed installer must not replace it');
  } else {
    assert.equal(installer.snapshot().supported, true, 'the CI platform must have an automatic install path');
    const installed = await installer.install({ force: true });
    assert.equal(installed.installed, true);
    assert.equal(fs.existsSync(installer.binaryPath), true);
    assert.equal(installed.phase, 'done');
    binary = installer.binaryPath;
    const probe = await runCommand([binary, 'version'], { timeoutMs: 20_000 });
    assert.match(`${probe.stdout}\n${probe.stderr}`, /v?\d+\.\d+\.\d+/);
    console.log(`[installer] installed ${installed.installedVersion ?? 'unknown version'} at ${binary}`);
    console.log((probe.stdout || probe.stderr).trim());
  }

  await verifySavedKey(binary, root);
  console.log('[installer] tailcat serve accepted the local door target with a saved key');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

/**
 * Generate a saved key at the path the Host resolves, then start a local
 * door-like listener through it. This catches key-path, go os.UserConfigDir,
 * and serve-spec regressions that a version probe cannot.
 * @param {string} binary - installed tailcat path.
 * @param {string} root - throwaway data root.
 */
async function verifySavedKey(binary, root) {
  const keyName = `dsh-smoke-${process.pid}`;
  const keyFile = tailcatKeyPath(keyName);
  await runCommand([binary, 'genkey', '--key=' + keyName, '--fixed-region'], { timeoutMs: 120_000 });
  assert.equal(fs.existsSync(keyFile), true, `tailcat genkey did not create ${keyFile}`);
  try {
    await verifyServe(binary, root, keyName);
  } finally {
    fs.rmSync(keyFile, { force: true });
  }
}

/**
 * Start a local door-like listener and let the real tailcat validate/proxy to
 * it. This catches serve-spec regressions (Unix socket vs Windows TCP) that a
 * version probe cannot.
 * @param {string} binary - installed tailcat path.
 * @param {string} root - throwaway data root.
 * @param {string} [keyName] - saved key name or "new" for an ephemeral key.
 */
async function verifyServe(binary, root, keyName = 'new') {
  const useSocket = process.platform !== 'win32';
  const socketPath = path.join(root, 'door.sock');
  const server = net.createServer((socket) => socket.destroy());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    if (useSocket) server.listen(socketPath, resolve);
    else server.listen({ host: '127.0.0.1', port: 0 }, resolve);
  });
  const port = server.address().port;
  const target = useSocket ? `13080:${socketPath}` : `${port}:127.0.0.1:${port}`;
  const child = spawn(binary, ['--json', `--key=${keyName}`, 'serve', '--log', target], {
    cwd: root,
    env: { ...process.env },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`tailcat serve did not report an address:\n${output.slice(-4000)}`)), 180_000);
      const check = () => {
        if (/tc[A-Za-z0-9]{8,}/.test(output)) {
          clearTimeout(timer);
          resolve();
        }
      };
      child.stdout.on('data', check);
      child.stderr.on('data', check);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', (code, signal) => {
        clearTimeout(timer);
        reject(new Error(`tailcat serve exited with ${code ?? signal} before reporting an address:\n${output.slice(-4000)}`));
      });
    });
  } finally {
    child.kill('SIGKILL');
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', resolve);
      setTimeout(resolve, 5_000).unref?.();
    });
    await new Promise((resolve) => server.close(resolve));
    if (useSocket) fs.rmSync(socketPath, { force: true });
  }
}
