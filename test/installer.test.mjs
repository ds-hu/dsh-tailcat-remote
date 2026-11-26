import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  MANUAL_INSTALL_URL,
  MIN_TAILCAT_VERSION,
  TAILCAT_VERSION,
  TailcatInstaller,
  parseChecksums,
  platformSpec,
  versionAtLeast,
  versionParts,
} from '../src/installer.js';

test('platformSpec maps every upstream static archive and the Homebrew targets', () => {
  const linuxX64 = platformSpec('linux', 'x64');
  assert.equal(linuxX64.kind, 'archive');
  assert.equal(linuxX64.asset, `tailcat_${TAILCAT_VERSION}_linux_amd64.tar.gz`);
  assert.equal(linuxX64.source, 'upstream');
  assert.equal(linuxX64.binary, 'tailcat');

  const linuxArm64 = platformSpec('linux', 'arm64');
  assert.equal(linuxArm64.asset, `tailcat_${TAILCAT_VERSION}_linux_arm64.tar.gz`);

  const linuxArm = platformSpec('linux', 'arm');
  assert.equal(linuxArm.asset, `tailcat_${TAILCAT_VERSION}_linux_armv7.tar.gz`);

  const windowsX64 = platformSpec('win32', 'x64');
  assert.equal(windowsX64.kind, 'archive');
  assert.equal(windowsX64.asset, `tailcat_${TAILCAT_VERSION}_windows_amd64.zip`);
  assert.equal(windowsX64.binary, 'tailcat.exe');
  assert.equal(windowsX64.format, 'zip');

  const windowsArm64 = platformSpec('win32', 'arm64');
  assert.equal(windowsArm64.asset, `tailcat_${TAILCAT_VERSION}_windows_arm64.zip`);

  const macArm = platformSpec('darwin', 'arm64');
  assert.equal(macArm.kind, 'brew');
  assert.equal(macArm.command, 'brew install tailcat');
  assert.equal(platformSpec('darwin', 'x64').kind, 'brew');
});

test('platformSpec leaves unknown systems on the manual-install path', () => {
  const unsupported = platformSpec('freebsd', 'x64');
  assert.equal(unsupported.kind, 'unsupported');
  assert.equal(unsupported.os, 'freebsd');
  assert.equal(platformSpec('linux', 's390x').kind, 'unsupported');
});

test('parseChecksums accepts the upstream manifest format and ignores noise', () => {
  const checksums = parseChecksums(
    [
      '46a243659c28249f42702ecad4af136a388d5c8f7a77a7eaaa77f98495d5ba61  tailcat_0.8.0_linux_amd64.tar.gz',
      '55d8c33f474fb2ecac31bc433ab9d713844e2bf80605737b1de9448ada747243 *tailcat_0.8.0_windows_amd64.zip',
      '',
      'not a checksum line',
      '0000000000000000000000000000000000000000000000000000000000000000  duplicate.txt',
      'FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF  duplicate.txt',
    ].join('\n'),
  );
  assert.equal(
    checksums.get('tailcat_0.8.0_linux_amd64.tar.gz'),
    '46a243659c28249f42702ecad4af136a388d5c8f7a77a7eaaa77f98495d5ba61',
  );
  assert.equal(
    checksums.get('tailcat_0.8.0_windows_amd64.zip'),
    '55d8c33f474fb2ecac31bc433ab9d713844e2bf80605737b1de9448ada747243',
  );
  assert.equal(checksums.get('duplicate.txt'), 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
  assert.equal(checksums.size, 3);
});

test('versionAtLeast enforces the Unix-socket minimum', () => {
  assert.deepEqual(versionParts('v0.8.0'), [0, 8, 0]);
  assert.equal(versionAtLeast('v0.8.0', MIN_TAILCAT_VERSION), true);
  assert.equal(versionAtLeast('v0.8.1', MIN_TAILCAT_VERSION), true);
  assert.equal(versionAtLeast('v0.10.0', MIN_TAILCAT_VERSION), true);
  assert.equal(versionAtLeast('v0.7.9', MIN_TAILCAT_VERSION), false);
  assert.equal(versionAtLeast('tailcat version v0.7.0', MIN_TAILCAT_VERSION), false);
  assert.equal(versionAtLeast(null, MIN_TAILCAT_VERSION), false);
});

test('detectSystem marks an old tailcat incompatible', async () => {
  const installer = new TailcatInstaller(
    {},
    {
      platform: 'darwin',
      arch: 'arm64',
      paths: {
        dataDir: path.join('/nonexistent', 'data'),
        binaryDir: path.join('/nonexistent', 'data', 'bin'),
        binaryPath: path.join('/nonexistent', 'data', 'bin', 'tailcat'),
        stagingRoot: path.join('/nonexistent', 'data', '.install'),
      },
      resolveExecutable: async () => '/opt/homebrew/bin/tailcat',
      runCommand: async () => ({ stdout: 'tailcat version v0.7.0\n', stderr: '', exitCode: 0 }),
    },
  );
  const system = await installer.detectSystem();
  assert.equal(system.status, 'found');
  assert.equal(system.compatible, false);
});

test('detectSystem reports a user-installed tailcat without touching managed paths', async () => {
  const calls = [];
  const installer = new TailcatInstaller(
    {},
    {
      platform: 'linux',
      arch: 'x64',
      paths: {
        dataDir: path.join('/nonexistent', 'data'),
        binaryDir: path.join('/nonexistent', 'data', 'bin'),
        binaryPath: path.join('/nonexistent', 'data', 'bin', 'tailcat'),
        stagingRoot: path.join('/nonexistent', 'data', '.install'),
      },
      resolveExecutable: async (name) => {
        calls.push(name);
        return '/usr/local/bin/tailcat';
      },
      runCommand: async () => ({
        stdout: 'tailcat version v0.8.0\n',
        stderr: '',
        exitCode: 0,
      }),
    },
  );
  const system = await installer.detectSystem();
  assert.equal(system.status, 'found');
  assert.equal(system.path, '/usr/local/bin/tailcat');
  assert.equal(system.version, 'v0.8.0');
  assert.equal(system.compatible, true);
  assert.deepEqual(calls, ['tailcat']);
  assert.equal(installer.hasInstalled(), false);
  assert.equal(installer.snapshot().system.status, 'found');
  assert.equal(installer.snapshot().manualUrl, MANUAL_INSTALL_URL);
});

test('detectSystem reports a missing tailcat rather than an install error', async () => {
  const installer = new TailcatInstaller(
    {},
    {
      platform: 'freebsd',
      arch: 'x64',
      resolveExecutable: async () => {
        throw new Error('not found');
      },
      runCommand: async () => {
        throw new Error('must not run');
      },
    },
  );
  const system = await installer.detectSystem();
  assert.equal(system.status, 'missing');
  assert.equal(system.path, null);
  assert.equal(system.version, null);
});

test('detectSystem keeps a found path when the version probe is inconclusive', async () => {
  const installer = new TailcatInstaller(
    {},
    {
      platform: 'linux',
      arch: 'x64',
      resolveExecutable: async () => '/opt/tailcat',
      runCommand: async () => {
        throw new Error('version command failed');
      },
    },
  );
  const system = await installer.detectSystem();
  assert.equal(system.status, 'found');
  assert.equal(system.path, '/opt/tailcat');
  assert.equal(system.version, null);
});
