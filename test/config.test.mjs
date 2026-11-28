import test from 'node:test';
import assert from 'node:assert/strict';
import { Config, DEFAULT_LISTEN, DEFAULT_PORT, resolveConfig, configView } from '../src/config.js';

test('Config defaults describe the safe common case', () => {
  const config = Config({});
  assert.equal(config.binaryPath, 'tailcat');
  assert.equal(config.port, DEFAULT_PORT);
  assert.equal(config.listen, DEFAULT_LISTEN);
  assert.equal(config.socketPath, '');
  assert.equal(config.keyName, 'dsh-tailcat');
  assert.equal(config.addressMode, 'stable');
  assert.equal(config.derpMapUrl, '');
  assert.equal(config.autoStart, true);
  assert.equal(config.logAccess, true);
  assert.equal(config.restartEnabled, true);
  assert.equal(config.maxRestartAttempts, 10);
  assert.equal(config.restartBaseDelayMs, 500);
  assert.equal(config.restartMaxDelayMs, 30_000);
});

test('Config rejects an unknown listen mode and an impossible port', () => {
  assert.throws(() => Config({ listen: 'public' }));
  assert.throws(() => Config({ port: 0 }));
  assert.throws(() => Config({ port: 65_536 }));
});

test('resolveConfig repairs malformed rows instead of throwing', () => {
  const config = resolveConfig({
    binaryPath: '   ',
    port: 70_000,
    listen: 'public',
    keyName: '',
    addressMode: 'rotating',
    maxRestartAttempts: 1_000,
    restartBaseDelayMs: 1,
    restartMaxDelayMs: 50,
    autoStart: 'yes',
    logAccess: 0,
    restartEnabled: null,
  });

  assert.equal(config.binaryPath, 'tailcat');
  assert.equal(config.port, DEFAULT_PORT);
  assert.equal(config.listen, DEFAULT_LISTEN);
  assert.equal(config.keyName, 'dsh-tailcat');
  assert.equal(config.addressMode, 'stable');
  assert.equal(config.maxRestartAttempts, 100);
  assert.equal(config.restartBaseDelayMs, 500);
  assert.equal(config.restartMaxDelayMs, 30_000);
  assert.equal(config.autoStart, true);
  assert.equal(config.logAccess, true);
  assert.equal(config.restartEnabled, true);
});

test('resolveConfig keeps the configured values that are valid', () => {
  const config = resolveConfig({
    binaryPath: '/opt/tailcat/bin/tailcat',
    port: 15_000,
    listen: 'tcp',
    keyName: 'custom-key',
    addressMode: 'ephemeral',
    derpMapUrl: 'https://derp.example/map.json',
    autoStart: false,
    logAccess: false,
    restartEnabled: false,
    maxRestartAttempts: 3,
    restartBaseDelayMs: 750,
    restartMaxDelayMs: 9_000,
  });

  assert.deepEqual(config, {
    binaryPath: '/opt/tailcat/bin/tailcat',
    port: 15_000,
    listen: 'tcp',
    socketPath: '',
    keyName: 'custom-key',
    addressMode: 'ephemeral',
    derpMapUrl: 'https://derp.example/map.json',
    autoStart: false,
    logAccess: false,
    restartEnabled: false,
    maxRestartAttempts: 3,
    restartBaseDelayMs: 750,
    restartMaxDelayMs: 9_000,
  });
});

test('resolveConfig keeps the restart ceiling above its base delay', () => {
  const config = resolveConfig({ restartBaseDelayMs: 10_000, restartMaxDelayMs: 2_000 });
  assert.equal(config.restartBaseDelayMs, 10_000);
  assert.equal(config.restartMaxDelayMs, 10_000);
});

test('configView never includes the DERP URL or key material', () => {
  const view = configView(
    resolveConfig({ derpMapUrl: 'https://private.example/map.json', binaryPath: '/opt/tailcat', keyName: 'key-one' }),
  );

  assert.equal(view.customDerpMap, true);
  assert.equal(view.binaryPath, '/opt/tailcat');
  assert.equal(view.keyName, 'key-one');
  assert.equal('derpMapUrl' in view, false);
  assert.equal('address' in view, false);
});
