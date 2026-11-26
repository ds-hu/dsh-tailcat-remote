// The client bundle carries the old-WebView shim, and the shim only runs before
// any plugin applies if the bundle itself is executed then. These tests load the
// shipped bundle with the engine's APIs removed and assert both halves of that
// contract: the APIs come back, and they are back before the bundle registers.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, test } from 'node:test';
import vm from 'node:vm';

const bundle = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const manifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const registered = [];
const natives = {
  any: AbortSignal.any,
  withResolvers: Promise.withResolvers,
  promiseTry: Promise.try,
  toSorted: Array.prototype.toSorted,
  canParse: URL.canParse,
  urlParse: URL.parse,
};

delete AbortSignal.any;
delete Promise.withResolvers;
delete Promise.try;
delete Array.prototype.toSorted;
delete URL.canParse;
delete URL.parse;

assert.equal(
  typeof AbortSignal.any,
  'undefined',
  'the test must start without the native APIs, or every assertion below is vacuous',
);
assert.equal(typeof Promise.withResolvers, 'undefined');
assert.equal(typeof Promise.try, 'undefined');
assert.equal(typeof Array.prototype.toSorted, 'undefined');
assert.equal(typeof URL.canParse, 'undefined');
assert.equal(typeof URL.parse, 'undefined');

/** Runs the shipped bundle as a classic page script in this realm. */
function runBundle() {
  globalThis.window = globalThis;
  globalThis.__ModuleLoader__ = {
    load(entry) {
      // The shim must already have run at this point: registration is stage one,
      // and anything after it executes when a plugin imports, i.e. too late for
      // the connection's first generation.
      assert.equal(
        typeof AbortSignal.any,
        'function',
        'the shim must run before the bundle registers its factory',
      );
      registered.push(entry);
    },
  };
  vm.runInThisContext(bundle, { filename: 'client.js' });
  return globalThis.__cuplivoHarnessCompat;
}

after(() => {
  Object.defineProperty(AbortSignal, 'any', {
    configurable: true,
    writable: true,
    value: natives.any,
  });
  Object.defineProperty(Promise, 'withResolvers', {
    configurable: true,
    writable: true,
    value: natives.withResolvers,
  });
  Object.defineProperty(Promise, 'try', {
    configurable: true,
    writable: true,
    value: natives.promiseTry,
  });
  Object.defineProperty(Array.prototype, 'toSorted', {
    configurable: true,
    writable: true,
    value: natives.toSorted,
  });
  Object.defineProperty(URL, 'canParse', {
    configurable: true,
    writable: true,
    value: natives.canParse,
  });
  Object.defineProperty(URL, 'parse', {
    configurable: true,
    writable: true,
    value: natives.urlParse,
  });
});

test('the bundle registers one factory under the package name', () => {
  const report = runBundle();

  assert.equal(registered.length, 1);
  assert.equal(registered[0].id, manifest.name);
  assert.equal(typeof registered[0].factory, 'function');
  assert.deepEqual([...report.missing], []);
});

test('installs every API the WebUI calls without a fallback', () => {
  assert.equal(typeof AbortSignal.any, 'function');
  assert.equal(typeof Promise.withResolvers, 'function');
  assert.equal(typeof Promise.try, 'function');
  assert.equal(typeof [].toSorted, 'function');
  assert.equal(typeof URL.canParse, 'function');
  assert.equal(typeof URL.parse, 'function');
});

test('stage-one prefetch is declared, so the shim runs before plugins apply', () => {
  assert.equal(manifest.dsh.client.platform, 'web');
  assert.equal(manifest.dsh.client.immediately, true);
  assert.equal(manifest.exports['./client'], './client.js');
});

test('AbortSignal.any follows the first abort and keeps its reason', () => {
  const first = new AbortController();
  const second = new AbortController();
  const combined = AbortSignal.any([first.signal, second.signal]);

  const reason = new Error('first');
  first.abort(reason);
  assert.equal(combined.aborted, true);
  assert.equal(combined.reason, reason);

  second.abort(new Error('second'));
  assert.equal(combined.reason, reason);
});

test('AbortSignal.any adopts an already-aborted source', () => {
  const reason = new Error('already');
  const aborted = new AbortController();
  aborted.abort(reason);

  const combined = AbortSignal.any([new AbortController().signal, aborted.signal]);

  assert.equal(combined.aborted, true);
  assert.equal(combined.reason, reason);
});

test('Promise.withResolvers and toSorted behave as the WebUI expects', async () => {
  const resolvers = Promise.withResolvers();
  resolvers.resolve('value');
  assert.equal(await resolvers.promise, 'value');

  const input = [3, 1, 2];
  assert.deepEqual(input.toSorted((a, b) => a - b), [1, 2, 3]);
  assert.deepEqual(input, [3, 1, 2], 'toSorted must not mutate its receiver');
});

test('URL.canParse answers like the native and never throws', () => {
  assert.equal(URL.canParse('https://example.com/a'), true);
  assert.equal(URL.canParse('/local/path'), false);
  assert.equal(URL.canParse('not a url'), false);
  assert.equal(URL.canParse('/local/path', 'https://example.com'), true);
});

test('URL.parse returns a URL or null, never throws', () => {
  const parsed = URL.parse('https://example.com/a');
  assert.ok(parsed instanceof URL);
  assert.equal(parsed.pathname, '/a');
  assert.equal(URL.parse('not a url'), null);
  assert.equal(URL.parse('/local/path', 'https://example.com').href, 'https://example.com/local/path');
});

test('Promise.try starts the call and turns a sync throw into a rejection', async () => {
  assert.equal(await Promise.try(() => 'value'), 'value');
  assert.equal(await Promise.try((a, b) => a + b, 1, 2), 3);
  await assert.rejects(Promise.try(() => {
    throw new Error('boom');
  }), /boom/);
});

test('leaves an existing implementation alone and records it', () => {
  delete globalThis.__cuplivoHarnessCompat;
  const sentinel = function sentinel() {};
  Object.defineProperty(AbortSignal, 'any', {
    configurable: true,
    writable: true,
    value: sentinel,
  });

  const report = runBundle();

  assert.equal(AbortSignal.any, sentinel);
  assert.ok(report.present.includes('AbortSignal.any'));
  assert.ok(!report.installed.includes('AbortSignal.any'));
});

test('a second execution at the same revision is a no-op', () => {
  const before = globalThis.__cuplivoHarnessCompat;

  runBundle();

  assert.equal(globalThis.__cuplivoHarnessCompat, before);
});

test('a newer revision re-runs over an older report', () => {
  // The harness swaps a bundle in place on a rebuild: the file executes again
  // in a page that already has the previous revision's report.
  delete globalThis.__cuplivoHarnessCompat;
  globalThis.__cuplivoHarnessCompat = { revision: 1, missing: [] };
  delete URL.canParse;
  assert.equal(typeof URL.canParse, 'undefined');

  const report = runBundle();

  assert.equal(report.revision, 2);
  assert.equal(typeof URL.canParse, 'function', 'the new revision must install its new API');
  assert.ok(report.installed.includes('URL.canParse'));
});

test('an engine without AbortController or URL is reported, not fatal', () => {
  // A fresh realm has ECMAScript intrinsics but no Web APIs: Promise and Array
  // receive their polyfills, AbortSignal and URL have no owner, and the loader
  // still runs.
  const context = vm.createContext({});
  vm.runInContext('globalThis.window = globalThis;', context);
  vm.runInContext(
    'globalThis.__ModuleLoader__ = { load: function (entry) { } };',
    context,
  );

  vm.runInContext(bundle, context);

  const report = vm.runInContext('globalThis.__cuplivoHarnessCompat', context);
  assert.ok(report.failed.some((entry) => entry.startsWith('AbortSignal.any')));
  assert.deepEqual([...report.missing], ['AbortSignal.any', 'URL.canParse', 'URL.parse']);
  assert.equal(vm.runInContext('typeof Promise.withResolvers', context), 'function');
  assert.equal(vm.runInContext('typeof [].toSorted', context), 'function');
});
