// The panel preference document is small enough to read as documentation, and
// that is the point: the sidebar shortcut is a choice the page owns, not
// deployment config, so it has one durable home and one on-by-default fallback.
// These tests pin the fallbacks: an absent, malformed, or half-valid document
// must never remove a feature the user did not switch off.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createPreferenceStore } from '../src/preferences.js';

/**
 * Runs one case in a throwaway data directory and removes it afterwards.
 * @param {(dir: string) => void} body - the test body.
 */
function withTempDir(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tcr-preferences-'));
  try {
    body(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Writes a preferences document, creating the directory on the way. */
function writeDocument(dir, document) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'preferences.json'), typeof document === 'string' ? document : JSON.stringify(document));
}

test('the defaults keep the sidebar shortcut on', () => {
  withTempDir((dir) => {
    const store = createPreferenceStore({ dir });

    assert.equal(store.snapshot().sidebarEntry, true, 'a profile with no preferences file still gets the fast path');
    assert.equal(store.snapshot().file, path.join(dir, 'preferences.json'));
    assert.deepEqual(store.snapshot().warnings, []);
  });
});

test('turning the switch off survives a reload', () => {
  withTempDir((dir) => {
    createPreferenceStore({ dir }).setSidebarEntry(false);

    const reopened = createPreferenceStore({ dir });
    assert.equal(reopened.snapshot().sidebarEntry, false);

    const document = JSON.parse(fs.readFileSync(reopened.file, 'utf8'));
    assert.equal(document.version, 1);
    assert.equal(document.sidebarEntry, false);
    assert.equal(typeof document.updatedAt, 'string');
  });
});

test('the store keeps unknown keys instead of dropping another version of them', () => {
  withTempDir((dir) => {
    writeDocument(dir, { sidebarEntry: true, future: { density: 'compact' } });

    const store = createPreferenceStore({ dir });
    store.setSidebarEntry(false);

    const document = JSON.parse(fs.readFileSync(store.file, 'utf8'));
    assert.deepEqual(document.future, { density: 'compact' });
    assert.equal(document.sidebarEntry, false);
  });
});

test('a malformed document falls back to the defaults and warns', () => {
  withTempDir((dir) => {
    writeDocument(dir, '{not json');

    const warnings = [];
    const store = createPreferenceStore({ dir, logger: { warn: (...args) => warnings.push(args.join(' ')) } });

    assert.equal(store.snapshot().sidebarEntry, true);
    assert.equal(store.snapshot().warnings.length, 1);
    assert.match(store.snapshot().warnings[0], /not valid JSON/);
    assert.equal(warnings.length, 1, 'the warning reaches the Host log');
  });
});

test('a non-boolean switch value is ignored, not treated as off', () => {
  withTempDir((dir) => {
    writeDocument(dir, { sidebarEntry: 'off' });

    const store = createPreferenceStore({ dir });
    assert.equal(store.snapshot().sidebarEntry, true);
    assert.match(store.snapshot().warnings.join(' '), /non-boolean/);
  });
});

test('the writer rejects anything that is not a boolean', () => {
  withTempDir((dir) => {
    const store = createPreferenceStore({ dir });

    assert.throws(() => store.setSidebarEntry('yes'), /sidebarEntry must be a boolean/);
    assert.throws(() => store.setSidebarEntry(0), /sidebarEntry must be a boolean/);
    assert.equal(store.snapshot().sidebarEntry, true);
  });
});

test('the file lands private instead of world readable', () => {
  withTempDir((dir) => {
    const store = createPreferenceStore({ dir });
    store.setSidebarEntry(false);

    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(store.file).mode & 0o777, 0o600);
    }
  });
});
