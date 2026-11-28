// The browser half owns one page and two ways to reach it: the Settings section
// is unconditional, while the sidebar row is a shortcut the Host can turn off
// (`sidebarEntry`, on by default). These tests run the shipped bundle against a
// fake context that enforces the same inject guard as Cordis and a stub for the
// one Host read the shortcut costs, so a future edit that moves the page, drops
// the shortcut, or makes the shortcut unconditional fails here instead of on a
// user's screen.
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

/** A Host read that answers with a snapshot carrying the given config. */
const hostWith = (config) => async () => ({
  ok: true,
  status: 200,
  json: async () => ({ ok: true, config }),
});

test('the Settings section registers before any Host read happens', () => {
  const { registrations } = applyPlugin({ react });

  assert.deepEqual(
    registrations.map(({ options }) => options.name),
    ['settings.section', 'settings.section.icon'],
    'the section is unconditional; only the shortcut waits for the Host',
  );

  const [section, icon] = registrations;
  assert.equal(section.options.id, NS);
  assert.equal(section.options.order, 30, 'the section sorts after Agent presets (20)');
  assert.equal(section.options.locale, NS, 'the section receives `t` from its own dictionary');
  assert.equal(typeof section.component, 'function');

  assert.equal(icon.options.id, NS, 'the glyph matches the section id or it never renders');
  assert.equal(typeof icon.component, 'function');
  assert.notEqual(icon.component, section.component, 'the glyph and the page are different components');
});

test('the default config adds the sidebar row and the page it selects', async () => {
  const face = applyPlugin({ react, fetch: hostWith({ sidebarEntry: true }) });
  await flush();

  assert.deepEqual(
    face.registrations.map(({ options }) => options.name),
    ['settings.section', 'settings.section.icon', 'sidebar.panellist', 'main'],
    'the shortcut exists by default, next to the section',
  );

  const [, , row, page] = face.registrations;
  assert.equal(row.options.id, NS);
  assert.equal(row.options.order, 30);
  assert.equal(row.options.label(), '远程访问', 'the row names the page in the active language');
  assert.equal(row.component, face.registrations[1].component, 'the row wears the section glyph');

  assert.equal(page.options.key, NS, 'a sidebar row addresses a main panel by the same id');
  assert.equal(page.options.locale, NS, 'the page receives `t` from its own dictionary');
  assert.equal(typeof page.component, 'function');
});

test('turning sidebarEntry off leaves only the Settings section', async () => {
  const { registrations } = applyPlugin({ react, fetch: hostWith({ sidebarEntry: false }) });
  await flush();

  assert.deepEqual(
    registrations.map(({ options }) => options.name),
    ['settings.section', 'settings.section.icon'],
    'the page stays reachable in Settings; only the shortcut disappears',
  );
});

test('an unreadable config keeps the documented default instead of hiding the row', async () => {
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
  const { injections } = applyPlugin({ react, fetch: hostWith({ sidebarEntry: true }) });
  await flush();

  assert.deepEqual(injections, ['settings.section', 'settings.section.icon', 'sidebar.panellist', 'main']);
});

test('the section label follows the active language', () => {
  const { registrations, dictionaries } = applyPlugin({ react });
  const [section] = registrations;

  assert.deepEqual(Object.keys(dictionaries.get(NS)).sort(), ['en', 'zh']);
  assert.equal(section.options.label(), '远程访问');
  assert.equal(dictionaries.get(NS).en.nav, 'Remote Access');
  assert.equal(dictionaries.get(NS).en.wireHarness, 'This Harness', 'the wire labels are translated');
});
