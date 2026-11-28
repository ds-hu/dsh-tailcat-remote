// The browser half owns one page and two ways to reach it: the Settings section
// and the main-area page are unconditional, while the sidebar row is a shortcut
// the panel preference can turn off (`sidebarEntry`, on by default). These tests
// run the shipped bundle against a fake context that enforces the same inject
// guard as Cordis and a stub for the one Host read the shortcut costs, so a
// future edit that moves the page, drops the shortcut, or makes the shortcut
// unconditional fails here instead of on a user's screen.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NS, applyPlugin, flush } from './helpers/client-harness.mjs';

const react = {
  createElement: () => null,
  useCallback: (callback) => callback,
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
};

/** A Host read that answers with a snapshot carrying the given preferences. */
const hostWith = (sidebarEntry) => async () => ({
  ok: true,
  status: 200,
  json: async () => ({ ok: true, preferences: { sidebarEntry } }),
});

test('the section and its page register before any Host read happens', () => {
  const { registrations } = applyPlugin({ react });

  assert.deepEqual(
    registrations.map(({ options }) => options.name),
    ['settings.section', 'settings.section.icon', 'main'],
    'the section and the page are unconditional; only the shortcut waits for the Host',
  );

  const [section, icon] = registrations;
  assert.equal(section.options.id, NS);
  assert.equal(section.options.order, 30, 'the section sorts after Agent presets (20)');
  assert.equal(section.options.locale, NS, 'the section receives `t` from its own dictionary');
  assert.equal(typeof section.component, 'function');

  assert.equal(icon.options.id, NS, 'the glyph matches the section id or it never renders');
  assert.equal(typeof icon.component, 'function');
  assert.notEqual(icon.component, section.component, 'the glyph and the page are different components');

  const page = registrations[2];
  assert.equal(page.options.key, NS, 'the main-area page keeps addressing the same id');
  assert.equal(page.options.locale, NS, 'the page receives `t` from its own dictionary');
  assert.equal(typeof page.component, 'function');
});

test('the default preference adds the sidebar row that selects the page', async () => {
  const face = applyPlugin({ react, fetch: hostWith(true) });
  await flush();

  assert.deepEqual(
    face.registrations.map(({ options }) => options.name),
    ['settings.section', 'settings.section.icon', 'main', 'sidebar.panellist'],
    'the shortcut exists by default, next to the section',
  );

  const row = face.registrations[3];
  assert.equal(row.options.id, NS);
  assert.equal(row.options.order, 30);
  assert.equal(row.options.label(), '远程访问', 'the row names the page in the active language');
  assert.equal(row.component, face.registrations[1].component, 'the row wears the section glyph');
});

test('turning the preference off leaves the section and the page, minus the row', async () => {
  const { registrations } = applyPlugin({ react, fetch: hostWith(false) });
  await flush();

  assert.deepEqual(
    registrations.map(({ options }) => options.name),
    ['settings.section', 'settings.section.icon', 'main'],
    'the page stays addressable and the section stays visible; only the row disappears',
  );
});

test('an unreadable preference keeps the documented default instead of hiding the row', async () => {
  const failing = async () => {
    throw new Error('sidecar unreachable');
  };
  const unreadable = applyPlugin({ react, fetch: failing });
  await flush();
  assert.ok(
    unreadable.registrations.some(({ options }) => options.name === 'sidebar.panellist'),
    'a failed read must not remove the shortcut',
  );

  const notOk = applyPlugin({
    react,
    fetch: async () => ({ ok: false, status: 503, json: async () => ({}) }),
  });
  await flush();
  assert.ok(
    notOk.registrations.some(({ options }) => options.name === 'sidebar.panellist'),
    'an error status must not remove the shortcut',
  );
});

test('every registration waits for its slot type to be declared', async () => {
  const { injections } = applyPlugin({ react, fetch: hostWith(true) });
  await flush();

  assert.deepEqual(injections, ['settings.section', 'settings.section.icon', 'main', 'sidebar.panellist']);
});

test('the section label follows the active language', () => {
  const { registrations, dictionaries } = applyPlugin({ react });
  const [section] = registrations;

  assert.deepEqual(Object.keys(dictionaries.get(NS)).sort(), ['en', 'zh']);
  assert.equal(section.options.label(), '远程访问');
  assert.equal(dictionaries.get(NS).en.nav, 'Remote Access');
  assert.equal(dictionaries.get(NS).en.wireHarness, 'This Harness', 'the wire labels are translated');
});
