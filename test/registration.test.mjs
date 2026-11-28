// The browser half is one page, and where it lives is a product decision that
// has already changed once. These tests run the shipped bundle against a fake
// context that enforces the same inject guard as Cordis, so a future edit that
// moves the page back into the sidebar (or registers the wrong slot type) fails
// here instead of on a user's screen.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NS, applyPlugin } from './helpers/client-harness.mjs';

const react = {
  createElement: () => null,
  useCallback: (callback) => callback,
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
};

test('the page is registered as a Settings section, not a sidebar panel', () => {
  const { registrations } = applyPlugin({ react });

  assert.deepEqual(
    registrations.map(({ options }) => options.name),
    ['settings.section', 'settings.section.icon'],
    'the browser half owns exactly two slot registrations, both in Settings',
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

test('the section label follows the active language', () => {
  const { registrations, dictionaries } = applyPlugin({ react });
  const [section] = registrations;

  assert.deepEqual(Object.keys(dictionaries.get(NS)).sort(), ['en', 'zh']);
  assert.equal(section.options.label(), '远程访问');
  assert.equal(dictionaries.get(NS).en.nav, 'Remote Access');
});

test('both registrations wait for their slot type to be declared', () => {
  const { injections } = applyPlugin({ react });

  assert.deepEqual(injections, ['settings.section', 'settings.section.icon']);
});
