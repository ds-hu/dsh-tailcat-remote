import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDeviceStore, normalizeDeviceKey, parseDeviceKeys } from '../src/devices.js';

const HEX = '0123456789abcdef'.repeat(4);
const LONG = `nodekey:${HEX}`;
const SHORT = `nodekey:${HEX.slice(0, 63)}`;

test('normalizeDeviceKey accepts nodekey and bare hex, and canonicalizes case', () => {
  assert.equal(normalizeDeviceKey(LONG), `nodekey:${HEX}`);
  assert.equal(normalizeDeviceKey(HEX), `nodekey:${HEX}`);
  assert.equal(normalizeDeviceKey(`  nodekey:${HEX.toUpperCase()}  `), `nodekey:${HEX}`);
});

test('normalizeDeviceKey rejects malformed keys with a 400 error', () => {
  for (const value of [SHORT, 'nodekey:xyz', '', null, 42]) {
    assert.throws(
      () => normalizeDeviceKey(value),
      (error) => error instanceof Error && error.status === 400,
    );
  }
});

test('parseDeviceKeys ignores blank lines and comments and de-duplicates', () => {
  const text = [`# client keys`, '', LONG, `  ${HEX.toUpperCase()}  `, '# trailing comment'].join('\n');
  assert.deepEqual(parseDeviceKeys(text), [`nodekey:${HEX}`]);
});

test('the device store persists a canonical, mode-0600 allow-list', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcr-devices-'));
  try {
    const store = createDeviceStore({ dir });
    assert.deepEqual(store.snapshot(), {
      allow: [],
      enforced: false,
      count: 0,
      file: path.join(dir, 'devices.json'),
      updatedAt: null,
      warnings: [],
    });

    const keys = store.replace([HEX, LONG, `NODEKEY:${HEX.toUpperCase()}`]);
    assert.deepEqual(keys, [`nodekey:${HEX}`]);

    const snapshot = store.snapshot();
    assert.equal(snapshot.count, 1);
    assert.equal(snapshot.enforced, true);
    assert.equal(typeof snapshot.updatedAt, 'string');

    const document = JSON.parse(fs.readFileSync(path.join(dir, 'devices.json'), 'utf8'));
    assert.equal(document.version, 1);
    assert.deepEqual(document.allow, [`nodekey:${HEX}`]);
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(path.join(dir, 'devices.json')).mode & 0o777, 0o600);
    }

    const reloaded = createDeviceStore({ dir }).snapshot();
    assert.deepEqual(reloaded.allow, [`nodekey:${HEX}`]);
    assert.equal(reloaded.updatedAt, snapshot.updatedAt);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the device store starts in address-only mode when the file is corrupt', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcr-devices-'));
  try {
    fs.writeFileSync(path.join(dir, 'devices.json'), '{not json');
    const store = createDeviceStore({ dir });
    const snapshot = store.snapshot();

    assert.deepEqual(snapshot.allow, []);
    assert.equal(snapshot.enforced, false);
    assert.equal(snapshot.warnings.length, 1);
    assert.match(snapshot.warnings[0], /not valid JSON/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the device store rejects a non-array replacement', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcr-devices-'));
  try {
    const store = createDeviceStore({ dir });
    assert.throws(
      () => store.replace('not-an-array'),
      (error) => error instanceof Error && error.status === 400,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
