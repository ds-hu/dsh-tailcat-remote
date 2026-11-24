import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './paths.js';
import { RemoteAccessError } from './errors.js';

/** A tailcat client identity public key: `nodekey:` plus 32 bytes of hex. */
const NODE_KEY = /^nodekey:[0-9a-fA-F]{64}$/;

/**
 * Normalize one pasted key to canonical lower-case `nodekey:<hex>` form.
 * A bare 64-character hex string is accepted because that is what a key file
 * or a shortened CLI output may show.
 * @param {unknown} value - pasted key.
 * @returns {string} canonical key.
 * @throws {RemoteAccessError} when the value is not a tailcat node public key.
 */
export function normalizeDeviceKey(value) {
  if (typeof value !== 'string') {
    throw new RemoteAccessError('invalid-device-key', 'Each allowed device must be a nodekey string.', 400);
  }
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  const hex = lower.startsWith('nodekey:') ? lower.slice('nodekey:'.length) : trimmed;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new RemoteAccessError(
      'invalid-device-key',
      `Not a tailcat node public key: ${trimmed.slice(0, 24)}${trimmed.length > 24 ? '…' : ''}. Expected nodekey: followed by 64 hex characters.`,
      400,
    );
  }
  return `nodekey:${hex.toLowerCase()}`;
}

/**
 * One line per key, ignoring blank lines and `#` comments.
 * @param {string} text - textarea contents.
 * @returns {string[]} canonical keys.
 */
export function parseDeviceKeys(text) {
  const keys = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    keys.push(normalizeDeviceKey(line));
  }
  return [...new Set(keys)];
}

/**
 * The durable allow-list of tailcat client keys. Address-only mode is the
 * empty list; a non-empty list becomes `tailcat serve --allow=...`.
 * @param {{ dir?: string, logger?: { warn: (...args: any[]) => void } }} [options] - test/overrides.
 */
export function createDeviceStore(options = {}) {
  const dir = options.dir ?? dataDir();
  const file = path.join(dir, 'devices.json');
  const logger = options.logger;
  /** @type {string[]} */
  let allow = [];
  /** @type {string[]} */
  let warnings = [];
  let updatedAt = null;

  load();

  /** Read the durable document, tolerating absence and dropping invalid rows. */
  function load() {
    allow = [];
    warnings = [];
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (error) {
      if (error && error.code === 'ENOENT') return;
      warnings.push(`Could not read the device allow-list: ${messageOf(error)}`);
      logger?.warn(`tailcat-remote: ${warnings.at(-1)}`);
      return;
    }
    let document;
    try {
      document = JSON.parse(text);
    } catch {
      warnings.push('The device allow-list file is not valid JSON; starting in address-only mode.');
      logger?.warn(`tailcat-remote: ${warnings.at(-1)}`);
      return;
    }
    const rows = Array.isArray(document) ? document : Array.isArray(document?.allow) ? document.allow : null;
    if (rows === null) {
      warnings.push('The device allow-list file has an unknown shape; starting in address-only mode.');
      logger?.warn(`tailcat-remote: ${warnings.at(-1)}`);
      return;
    }
    for (const row of rows) {
      try {
        allow.push(normalizeDeviceKey(row));
      } catch {
        warnings.push('Ignored an invalid key in the device allow-list.');
      }
    }
    allow = [...new Set(allow)];
    updatedAt = typeof document?.updatedAt === 'string' ? document.updatedAt : null;
    if (warnings.length > 0) logger?.warn(`tailcat-remote: ${warnings.join(' ')}`);
  }

  /**
   * Replace the whole allow-list durably and return the canonical values.
   * @param {string[]} values - keys from the panel or API.
   * @returns {string[]} canonical unique keys.
   * @throws {RemoteAccessError} when any key is invalid or persistence fails.
   */
  function replace(values) {
    if (!Array.isArray(values)) {
      throw new RemoteAccessError('invalid-device-list', 'allow must be an array of nodekey strings.', 400);
    }
    const keys = [...new Set(values.map(normalizeDeviceKey))];
    const document = {
      version: 1,
      allow: keys,
      updatedAt: new Date().toISOString(),
    };
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const temporary = path.join(dir, `.devices.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`);
      fs.writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });
      fs.renameSync(temporary, file);
      fs.chmodSync(file, 0o600);
    } catch (error) {
      throw new RemoteAccessError('device-store-write-failed', `Could not save the device allow-list: ${messageOf(error)}`);
    }
    allow = keys;
    warnings = [];
    updatedAt = document.updatedAt;
    return keys;
  }

  /** @returns {{ allow: string[], enforced: boolean, count: number, file: string, updatedAt: string | null, warnings: string[] }} */
  function snapshot() {
    return {
      allow: [...allow],
      enforced: allow.length > 0,
      count: allow.length,
      file,
      updatedAt,
      warnings: [...warnings],
    };
  }

  return { file, replace, reload: load, snapshot };
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
