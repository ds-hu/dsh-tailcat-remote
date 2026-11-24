import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as plugin from '../index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('the Host entry exports the Loader identity and its service requirements', () => {
  assert.equal(plugin.name, 'dsh-tailcat-remote');
  assert.deepEqual(plugin.inject, ['connection', 'webServer', 'subprocess']);
  assert.equal(typeof plugin.apply, 'function');
  assert.equal(typeof plugin.Config, 'function');
});

test('the Host Config has safe defaults before the Loader validates a row', () => {
  const config = plugin.Config({});
  assert.equal(config.listen, 'socket');
  assert.equal(config.addressMode, 'stable');
  assert.equal(config.autoStart, true);
  assert.equal(config.port, 13_080);
});

test('the bundle patch inserts one row with the exported Loader name', () => {
  const patch = read('cordis.patch.yml');
  assert.match(patch, /^- insert:/m);
  assert.match(patch, /id: dsh-tailcat-remote/);
  assert.match(patch, /name: '@ds-hu\/dsh-tailcat-remote'/);
  assert.equal((patch.match(/^    - id: dsh-tailcat-remote$/gm) ?? []).length, 1);
});

test('package.json points the bundle at that patch and ships every runtime file', () => {
  const manifest = JSON.parse(read('package.json'));

  assert.equal(manifest.name, '@ds-hu/dsh-tailcat-remote');
  assert.equal(manifest.type, 'module');
  assert.equal(manifest.main, 'index.js');
  assert.deepEqual(manifest.dsh.bundle.patch, ['./cordis.patch.yml']);
  assert.equal(manifest.dsh.client.platform, 'web');
  assert.equal(manifest.dependencies?.['@deepseek-ai/schemastery'], undefined);
  assert.equal(manifest.peerDependencies['@deepseek-ai/schemastery'].startsWith('^3.'), true);

  for (const file of ['index.js', 'client.js', 'src', 'vendor', 'locale', 'icon.svg', 'cordis.patch.yml']) {
    assert.equal(manifest.files.includes(file), true, `${file} must be published`);
  }
  assert.equal(manifest.files.includes('test'), false);
});

test('every locale document is valid JSON and carries the panel metadata', () => {
  const files = fs.readdirSync(path.join(root, 'locale')).filter((file) => file.endsWith('.json'));
  assert.equal(files.length >= 2, true);

  for (const file of files) {
    const document = JSON.parse(read(path.join('locale', file)));
    assert.equal(typeof document.meta?.title, 'string', `${file} needs meta.title`);
    assert.equal(document.meta.title.length > 0, true);
    assert.equal(typeof document.meta?.description, 'string', `${file} needs meta.description`);
  }
});

test('the client bundle registers the sidebar entry and the keyed main page', () => {
  const client = read('client.js');
  assert.match(client, /__ModuleLoader__\.load/);
  assert.match(client, /id: '@ds-hu\/dsh-tailcat-remote'/);
  assert.match(client, /sidebar\.panellist/);
  assert.match(client, /ctx\.slots\.inject\('main'/);
  assert.match(client, /key: 'tailcat-remote'/);
  assert.equal(client.includes('<div'), false, 'the client is plain React.createElement, not JSX');
});

test('the vendored QR generator keeps its MIT notice and exports the generator', () => {
  const vendor = read('vendor/qrcode.mjs');
  assert.match(vendor, /MIT license/);
  assert.match(vendor, /Kazuhiko Arase/);
  assert.match(vendor, /export \{ qrcode \}/);
});
