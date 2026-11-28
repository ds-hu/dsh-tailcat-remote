// Shared harness for the browser-half tests: it loads the shipped bundle the
// way the Web shell does and hands back the factory, plus a fake Cordis context
// that throws on an undeclared service exactly like the real inject guard.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const bundle = readFileSync(new URL('../../client.js', import.meta.url), 'utf8');

export const NS = 'tailcat-remote';

/** Loads the bundle and returns the factory it registers under the package name. */
export function loadFactory() {
  const entries = [];
  globalThis.window = globalThis;
  globalThis.__ModuleLoader__ = {
    load(entry) {
      entries.push(entry);
    },
  };
  vm.runInThisContext(bundle, { filename: 'client.js' });
  assert.equal(entries.length, 1, 'the bundle registers exactly one factory');
  return entries[0].factory;
}

/**
 * A context that behaves like Cordis at the two points this plugin touches:
 * `ctx.<service>` throws unless the service is declared in `inject`, and every
 * registration returns a disposer.
 * @param {string[]} injected - the services the plugin declares.
 */
export function makeContext(injected) {
  const registrations = [];
  const injections = [];
  const dictionaries = new Map();

  const translator = (namespace) => (key, params) => {
    const table = dictionaries.get(namespace)?.zh ?? {};
    const value = table[key] ?? key;
    if (!params) return value;
    return value.replace(/\{(\w+)\}/g, (match, name) =>
      Object.hasOwn(params, name) ? String(params[name]) : match,
    );
  };

  const services = {
    slots: {
      inject(name, callback) {
        injections.push(name);
        return callback();
      },
      register(options, component) {
        registrations.push({ options, component });
        return () => {};
      },
    },
    locale: {
      register(namespace, tables) {
        dictionaries.set(namespace, tables);
        return () => {};
      },
      bind: translator,
    },
  };

  const ctx = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'effect') return (callback) => callback();
        if (typeof property === 'symbol') return undefined;
        if (!injected.includes(property)) {
          throw new Error(`cannot get property "${property}" without inject`);
        }
        return services[property];
      },
    },
  );

  return { ctx, registrations, injections, dictionaries, translator };
}

/**
 * Applies the plugin to a fresh face.
 *
 * The Host read that decides the optional sidebar row happens during `apply`,
 * so a test that cares about that row passes its own `fetch`; without one the
 * harness removes the global, which is the bundle's no-fetch fallback and keeps
 * the suite off the network. Either way the page's global comes back afterwards.
 * @param {{ react: object, fetch?: Function }} options - the module table's `react` and the Host stub.
 */
export function applyPlugin({ react, fetch: readHost }) {
  const factory = loadFactory();
  const plugin = factory((specifier) => {
    if (specifier === 'react') return react;
    throw new Error(`unexpected require("${specifier}")`);
  });
  assert.ok(plugin, 'the factory exports the plugin');
  assert.deepEqual(plugin.inject, ['slots', 'locale'], 'the plugin declares its services');

  const previous = globalThis.fetch;
  if (typeof readHost === 'function') globalThis.fetch = readHost;
  else delete globalThis.fetch;
  const face = makeContext(plugin.inject);
  try {
    plugin.apply(face.ctx);
  } finally {
    if (previous === undefined) delete globalThis.fetch;
    else globalThis.fetch = previous;
  }
  return { ...face, plugin, react };
}

/** Lets deferred registrations settle: they await one Host read before they register. */
export async function flush() {
  for (let turn = 0; turn < 4; turn += 1) await new Promise((resolve) => setImmediate(resolve));
}
