import test from 'node:test';
import assert from 'node:assert/strict';
import { surfaceOf } from '../src/surface.js';

/** Minimal Host context double: only `get` is read by surfaceOf. */
function ctxWith(context) {
  return { get: (name) => (name === 'profileContext' ? context : undefined) };
}

test('the desktop profile is reported by name', () => {
  assert.deepEqual(surfaceOf(ctxWith({ name: 'desktop' })), { profile: 'desktop' });
});

test('the web profile is reported by name', () => {
  assert.deepEqual(surfaceOf(ctxWith({ name: 'web' })), { profile: 'web' });
});

test('a custom profile name survives untouched', () => {
  assert.deepEqual(surfaceOf(ctxWith({ name: 'shots' })), { profile: 'shots' });
});

test('a Host without a profile launcher reports no surface', () => {
  assert.deepEqual(surfaceOf({ get: () => undefined }), { profile: null });
  assert.deepEqual(surfaceOf({}), { profile: null });
  assert.deepEqual(surfaceOf(undefined), { profile: null });
});

test('a throwing or malformed service never fails plugin activation', () => {
  const throwing = {
    get: () => {
      throw new Error('not a service');
    },
  };
  assert.deepEqual(surfaceOf(throwing), { profile: null });
  assert.deepEqual(surfaceOf(ctxWith({ name: '' })), { profile: null });
  assert.deepEqual(surfaceOf(ctxWith({ name: 42 })), { profile: null });
  assert.deepEqual(surfaceOf(ctxWith(null)), { profile: null });
});
