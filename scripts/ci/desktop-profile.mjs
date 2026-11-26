/**
 * CI-only end-to-end check of the plugin on the Electron-owned `desktop` profile.
 *
 * The runner has no Electron, so the host is booted through the same exported
 * `runProfile` entry the desktop carrier uses (see `desktop-boot.mjs`) with the
 * desktop's own arguments. The profile itself is a real Harness profile named
 * `desktop` under the throwaway `DSH_HOME`: it is prepared with public CLI
 * commands (the reserved name only blocks creation through the CLI) and holds
 * the same bundle tuple the desktop application initializes.
 *
 * The harness then proves, over the wire, that a remote browser can reach the
 * desktop Harness:
 *   - the panel API reports the desktop surface and the OS-assigned port
 *   - the door mints a browser session for a tailnet-style Host and refuses a
 *     foreign one
 *   - the index and the plugin's own client bundle are served through the door
 *   - the Host shuts down again
 *
 * Environment:
 *   DSH_HOME                throwaway Harness home (required)
 *   DSH_INSTALL_ROOT        installed `@deepseek-ai/dsh` package (required)
 *   DSH_DESKTOP_AUTOSTART   "true" starts the tunnel (needs a tailcat on PATH)
 *   DSH_DESKTOP_LISTEN      "tcp" forces the loopback door (default: platform)
 *   DSH_DESKTOP_UI          "1" runs the Playwright check against the door
 *   DSH_DESKTOP_REMOTE_URL  URL the browser check opens (default door URL)
 *   DSH_BOOT_TIMEOUT_MS     boot deadline (default 180000)
 */

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const WIN = process.platform === 'win32';
const repo = process.cwd();
const home = process.env.DSH_HOME;
const installRoot = process.env.DSH_INSTALL_ROOT;
if (!home) throw new Error('DSH_HOME must name a throwaway Harness home');
if (!installRoot) throw new Error('DSH_INSTALL_ROOT must point at the installed @deepseek-ai/dsh package');
if (!path.isAbsolute(home)) throw new Error('DSH_HOME must be absolute');

const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
const profilesDir = path.join(home, 'profiles');
const stagingDir = path.join(profilesDir, 'desktopinit');
const profileDir = path.join(profilesDir, 'desktop');
const bootLog = path.join(home, 'desktop-boot.log');
const bootTimeout = Number(process.env.DSH_BOOT_TIMEOUT_MS ?? 180_000);
const autoStart = (process.env.DSH_DESKTOP_AUTOSTART ?? 'false') === 'true';
const forcedListen = process.env.DSH_DESKTOP_LISTEN ?? '';
const expectedDoorMode = forcedListen === 'tcp' ? 'tcp' : WIN ? 'tcp' : 'socket';

/** Run one public CLI command against the throwaway home. */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repo,
    env: { ...process.env, DSH_HOME: home },
    stdio: options.quiet === true ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    shell: WIN,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = options.quiet === true ? `: ${(result.stdout ?? '').trim().split(/\r?\n/).slice(-5).join(' | ')}` : '';
    throw new Error(`${command} ${args.join(' ')} exited with ${String(result.status)}${detail}`);
  }
  return result.stdout ?? '';
}

/**
 * Build the `desktop` profile from the shipped web template plus this checkout.
 * The Electron app initializes the reserved profile with exactly that bundle
 * tuple; a staging profile installed with public commands reproduces it, and
 * the directory is then renamed into place.
 */
function prepareProfile() {
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.rmSync(profileDir, { recursive: true, force: true });
  fs.mkdirSync(profilesDir, { recursive: true });

  // `--from-default-profile web` writes the template bundle list, the empty
  // user patch layer, and the pnpm workspace settings.
  run('dsh', ['--profile', 'desktopinit', '--from-default-profile', 'web', '--dump-config'], { quiet: true });

  const packDir = fs.mkdtempSync(path.join(home, 'pack-'));
  try {
    const packed = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', packDir], { quiet: true }));
    const tarball = path.join(packDir, packed[0].filename);
    // `dsh plugin add` reconciles `dsh.profile.bundles` for every profile the
    // public CLI owns, which is why the install happens under the staging name.
    run('dsh', ['plugin', '--profile', 'desktopinit', 'add', tarball]);
  } finally {
    fs.rmSync(packDir, { recursive: true, force: true });
  }

  const patch = [`- id: dsh-tailcat-remote`, `  config:`];
  patch.push(`    autoStart: ${autoStart}`);
  if (forcedListen !== '') patch.push(`    listen: ${forcedListen}`);
  fs.writeFileSync(path.join(stagingDir, 'cordis.patch.yml'), `${patch.join('\n')}\n`);

  // A rename keeps pnpm's relative links intact on every platform; copying the
  // hoisted store would have to recreate junctions, which Windows refuses
  // without privilege.
  fs.renameSync(stagingDir, profileDir);

  const manifestPath = path.join(profileDir, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.deepEqual(manifest.dsh?.profile?.bundles?.slice(0, 2), ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']);
  assert.equal(manifest.dsh.profile.bundles.includes(pkg.name), true, `${pkg.name} must be a profile bundle`);
  manifest.name = 'dsh-profile-desktop';
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/** Start the desktop host and resolve the authenticated URL it prints. */
function startHost() {
  fs.writeFileSync(bootLog, '');
  const child = spawn(process.execPath, [path.join(repo, 'scripts', 'ci', 'desktop-boot.mjs')], {
    cwd: repo,
    env: {
      ...process.env,
      DSH_HOME: home,
      DSH_INSTALL_ROOT: installRoot,
      DSH_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const url = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no dsh web URL line within ${bootTimeout}ms`)), bootTimeout);
    timer.unref?.();
    const inspect = () => {
      const match = /dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/.exec(output);
      if (match === null) return;
      clearTimeout(timer);
      resolve(match[1]);
    };
    const collect = (chunk) => {
      output = `${output}${chunk.toString('utf8')}`.slice(-400_000);
      fs.appendFileSync(bootLog, chunk);
      process.stdout.write(chunk);
      inspect();
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`desktop host exited before printing its URL (code ${String(code)})`));
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  return { child, url };
}

/** Join the `name=value` pairs of one or more Set-Cookie headers. */
function cookieHeader(setCookie) {
  if (setCookie === undefined) return null;
  const list = Array.isArray(setCookie) ? setCookie : [setCookie];
  const pairs = list.map((value) => String(value).split(';')[0].trim()).filter((pair) => pair.includes('='));
  return pairs.length > 0 ? pairs.join('; ') : null;
}

/** Fetch one panel API resource with an explicit browser session. */
async function api(origin, pathname, cookie) {
  const response = await fetch(new URL(pathname, origin), {
    redirect: 'manual',
    headers: cookie === null ? {} : { cookie },
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}

/** Issue one raw HTTP/1.1 request to the door and read the whole answer. */
function doorRequest(door, requestText) {
  return new Promise((resolve, reject) => {
    const socket = door.mode === 'socket'
      ? net.connect({ path: door.socketPath })
      : net.connect({ host: '127.0.0.1', port: door.port });
    const chunks = [];
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('the door did not answer within 20s'));
    }, 20_000);
    timer.unref?.();
    const finish = () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    };
    socket.once('connect', () => socket.write(requestText));
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.once('close', finish);
  });
}

/** Parse a raw HTTP response: status, headers (Set-Cookie kept as a list), body. */
function parseResponse(buffer, label) {
  const split = buffer.indexOf('\r\n\r\n');
  if (split < 0) throw new Error(`${label}: truncated response (${buffer.length} bytes)`);
  const head = buffer.subarray(0, split).toString('latin1').split('\r\n');
  const status = Number(head[0]?.split(' ')[1]);
  const headers = new Map();
  for (const line of head.slice(1)) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const name = line.slice(0, colon).toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (name === 'set-cookie') {
      headers.set(name, [...(headers.get(name) ?? []), value]);
    } else {
      headers.set(name, value);
    }
  }
  let body = buffer.subarray(split + 4);
  if (headers.get('transfer-encoding') === 'chunked') body = dechunk(body);
  else if (headers.get('content-length') !== undefined) body = body.subarray(0, Number(headers.get('content-length')));
  return { status, headers, body: body.toString('utf8') };
}

/** Reassemble a chunked body so assertions can read it as text. */
function dechunk(body) {
  const parts = [];
  let offset = 0;
  for (;;) {
    const end = body.indexOf('\r\n', offset);
    if (end < 0) break;
    const size = Number.parseInt(body.subarray(offset, end).toString('latin1').split(';')[0], 16);
    if (!Number.isFinite(size) || size === 0) break;
    parts.push(body.subarray(end + 2, end + 2 + size));
    offset = end + 2 + size + 2;
  }
  return Buffer.concat(parts);
}

/** Read the `__DSH_BOOT__` payload out of the served index document. */
function bootGraph(html) {
  const match = /<script>globalThis\["__DSH_BOOT__"\] = ([\s\S]*?)<\/script>/.exec(html);
  if (match === null) throw new Error('the served index document carries no __DSH_BOOT__ payload');
  return JSON.parse(match[1].replaceAll('\\u003c', '<'));
}

/** Wait for a child process to exit, then report its code (null when signalled). */
function exitWithin(child, ms) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve(child.exitCode);
      return;
    }
    const timer = setTimeout(() => resolve(undefined), ms);
    timer.unref?.();
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

const started = Date.now();
const manifest = prepareProfile();
console.log(`[desktop] profile ready at ${profileDir} (${manifest.dsh.profile.bundles.length} bundles)`);
const host = startHost();

try {
  const authenticated = new URL(await host.url);
  const origin = `${authenticated.protocol}//${authenticated.host}`;
  const webPort = Number(authenticated.port);
  console.log(`[desktop] host listening on ${origin} (OS-assigned port)`);

  const bootstrap = await fetch(authenticated, { redirect: 'manual' });
  assert.equal(bootstrap.status, 303, 'the printed URL must mint a browser session');
  const browserCookie = cookieHeader(
    bootstrap.headers.getSetCookie?.() ?? [bootstrap.headers.get('set-cookie')].filter(Boolean),
  );
  assert.notEqual(browserCookie, null, 'the browser handoff must set a cookie');

  const unauthenticated = await api(origin, '/api/tailcat-remote', null);
  assert.equal(unauthenticated.status, 401, 'the panel API must refuse an anonymous caller');

  const state = await api(origin, '/api/tailcat-remote', browserCookie);
  assert.equal(state.status, 200, `panel API answered ${String(state.status)}: ${state.text.slice(0, 400)}`);
  assert.equal(state.json?.surface?.profile, 'desktop', 'the Host must report the desktop profile');
  assert.equal(state.json.plugin.version, pkg.version);
  assert.equal(state.json.web.protocol, 'http:');
  assert.equal(state.json.web.port, webPort, 'the panel must report the OS-assigned port');
  assert.equal(state.json.door.listening, true, 'the door must be listening');
  assert.equal(state.json.door.mode, expectedDoorMode);
  assert.equal(state.json.door.target?.port, webPort, 'the door must forward to the live Web listener');
  if (autoStart) console.log(`[desktop] tunnel phase ${state.json.tailcat.phase}, binary ${state.json.tailcat.binary?.source ?? 'none'}`);
  else assert.equal(state.json.config.autoStart, false, 'the job patch must keep the tunnel off');
  console.log('[desktop] panel API reports the desktop surface and the live door');

  // A remote browser reaches the door as a tailnet peer: the door mints a
  // session bound to the address the peer actually used.
  const door = state.json.door;
  const peerHost = '127.0.0.1:18080';
  const minted = parseResponse(await doorRequest(door,
    `GET / HTTP/1.1\r\nHost: ${peerHost}\r\nAccept: text/html\r\nConnection: close\r\n\r\n`), 'door bootstrap');
  assert.equal(minted.status, 303, `the door must answer the bootstrap with 303, got ${String(minted.status)}`);
  const doorCookie = cookieHeader(minted.headers.get('set-cookie'));
  assert.notEqual(doorCookie, null, 'the door must hand the remote browser a session cookie');

  const denied = parseResponse(await doorRequest(door,
    'GET / HTTP/1.1\r\nHost: evil.example\r\nAccept: text/html\r\nConnection: close\r\n\r\n'), 'door foreign host');
  assert.equal(denied.headers.get('set-cookie'), undefined, 'a foreign Host must never receive a session');
  assert.ok(denied.status === 403 || denied.status === 401, `a foreign Host must be refused, got ${String(denied.status)}`);

  const index = parseResponse(await doorRequest(door,
    `GET / HTTP/1.1\r\nHost: ${peerHost}\r\nCookie: ${doorCookie}\r\nAccept: text/html\r\nConnection: close\r\n\r\n`), 'door index');
  assert.equal(index.status, 200, `the door must serve the Web GUI, got ${String(index.status)}`);
  const graph = bootGraph(index.body);
  const entry = graph.entries.find((row) => row.id === pkg.name);
  assert.notEqual(entry, undefined, `${pkg.name} must be advertised to the remote browser`);
  assert.ok(Array.isArray(entry.inject) && entry.inject.length > 0, 'the plugin row must reach the client with its injections');

  const bundle = parseResponse(await doorRequest(door,
    `GET /${entry.url} HTTP/1.1\r\nHost: ${peerHost}\r\nCookie: ${doorCookie}\r\nConnection: close\r\n\r\n`), 'plugin bundle');
  assert.equal(bundle.status, 200, `the door must serve the plugin client bundle, got ${String(bundle.status)}`);
  assert.match(bundle.body, /__ModuleLoader__\.load/);
  assert.match(bundle.body, /dsh-tailcat-remote/);
  console.log(`[desktop] door served the Web GUI and ${pkg.name} to a remote session (${entry.url})`);

  if (process.env.DSH_DESKTOP_UI === '1') {
    const remote = process.env.DSH_DESKTOP_REMOTE_URL ?? `http://127.0.0.1:${state.json.config.port}/`;
    const ui = spawnSync(process.execPath, [path.join(repo, 'scripts', 'ci', 'desktop-ui.mjs')], {
      cwd: repo,
      env: { ...process.env, DSH_REMOTE_URL: remote },
      stdio: 'inherit',
      shell: false,
    });
    if (ui.status !== 0) throw new Error(`the browser check failed with ${String(ui.status)} against ${remote}`);
  }

  host.child.kill('SIGTERM');
  const code = await exitWithin(host.child, 30_000);
  assert.notEqual(code, undefined, 'the desktop host did not stop within 30s');
  if (!WIN) assert.equal(code, 0, `graceful shutdown exited with ${String(code)}`);
  console.log(`[desktop] desktop profile verified in ${((Date.now() - started) / 1000).toFixed(1)}s`);
} catch (error) {
  host.child.kill('SIGKILL');
  console.error(`[desktop] boot log: ${bootLog}`);
  console.error(fs.existsSync(bootLog) ? fs.readFileSync(bootLog, 'utf8').split(/\r?\n/).slice(-80).join('\n') : '(missing)');
  throw error;
}
