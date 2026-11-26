import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tailcatKeyPath, userConfigDir } from '../src/paths.js';

const HOME = path.resolve('/home/example');

test('userConfigDir mirrors Go on macOS, Windows, and Linux', () => {
  assert.equal(userConfigDir('darwin', {}, HOME), path.join(HOME, 'Library', 'Application Support'));
  const appData = path.resolve('/appdata');
  assert.equal(userConfigDir('win32', { APPDATA: appData }, HOME), appData);
  const xdg = path.resolve('/xdg');
  assert.equal(userConfigDir('linux', { XDG_CONFIG_HOME: xdg }, HOME), xdg);
  assert.equal(userConfigDir('linux', {}, HOME), path.join(HOME, '.config'));
});

test('tailcatKeyPath places names under the same config root tailcat uses', () => {
  assert.equal(
    tailcatKeyPath('dsh-tailcat', 'darwin', {}, HOME),
    path.join(HOME, 'Library', 'Application Support', 'tailcat', 'keys', 'dsh-tailcat.private.json'),
  );
  assert.equal(
    tailcatKeyPath('dsh-tailcat', 'win32', { APPDATA: path.resolve('/appdata') }, HOME),
    path.join(path.resolve('/appdata'), 'tailcat', 'keys', 'dsh-tailcat.private.json'),
  );
  assert.equal(
    tailcatKeyPath('dsh-tailcat', 'linux', { XDG_CONFIG_HOME: path.resolve('/xdg') }, HOME),
    path.join(path.resolve('/xdg'), 'tailcat', 'keys', 'dsh-tailcat.private.json'),
  );
});

test('tailcatKeyPath treats slash and backslash values as paths from home', () => {
  assert.equal(tailcatKeyPath('keys/custom', 'linux', {}, HOME), path.resolve(HOME, 'keys/custom'));
  assert.equal(tailcatKeyPath('keys\\custom', 'win32', {}, HOME), path.resolve(HOME, 'keys\\custom'));
});
