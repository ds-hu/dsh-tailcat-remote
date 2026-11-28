import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './paths.js';
import { RemoteAccessError } from './errors.js';

/**
 * Panel preferences: the small choices the page itself owns, as opposed to the
 * deployment settings that live in the Host config. Only `sidebarEntry` exists
 * today — whether the sidebar keeps a shortcut row to the page — and it is on by
 * default, because the row is the fast path and the Settings section is always
 * there when it is off.
 *
 * The document is deliberately tiny and forward-compatible: unknown keys are
 * preserved when the file is written, and a malformed file falls back to the
 * defaults with a warning instead of failing activation.
 * @param {{ dir?: string, logger?: { warn: (...args: any[]) => void } }} [options] - test/overrides.
 */
export function createPreferenceStore(options = {}) {
  const dir = options.dir ?? dataDir();
  const file = path.join(dir, 'preferences.json');
  const logger = options.logger;
  /** @type {{ sidebarEntry: boolean }} */
  let value = defaults();
  /** @type {Record<string, unknown>} */
  let unknown = {};
  /** @type {string[]} */
  let warnings = [];
  let updatedAt = null;

  load();

  /** @returns {{ sidebarEntry: boolean }} the documented defaults. */
  function defaults() {
    return { sidebarEntry: true };
  }

  /** Read the durable document, tolerating absence and dropping invalid rows. */
  function load() {
    value = defaults();
    unknown = {};
    warnings = [];
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (error) {
      if (error && error.code === 'ENOENT') return;
      warnings.push(`Could not read the panel preferences: ${messageOf(error)}`);
      logger?.warn(`tailcat-remote: ${warnings.at(-1)}`);
      return;
    }
    let document;
    try {
      document = JSON.parse(text);
    } catch {
      warnings.push('The panel preferences file is not valid JSON; using the defaults.');
      logger?.warn(`tailcat-remote: ${warnings.at(-1)}`);
      return;
    }
    if (document === null || typeof document !== 'object' || Array.isArray(document)) {
      warnings.push('The panel preferences file has an unknown shape; using the defaults.');
      logger?.warn(`tailcat-remote: ${warnings.at(-1)}`);
      return;
    }
    const { version: _version, updatedAt: _updatedAt, sidebarEntry, ...rest } = document;
    if (typeof sidebarEntry === 'boolean') value.sidebarEntry = sidebarEntry;
    else if (sidebarEntry !== undefined) warnings.push('Ignored a non-boolean sidebarEntry preference.');
    unknown = rest;
    updatedAt = typeof document.updatedAt === 'string' ? document.updatedAt : null;
    if (warnings.length > 0) logger?.warn(`tailcat-remote: ${warnings.join(' ')}`);
  }

  /**
   * Turn the sidebar shortcut on or off durably and return the new snapshot.
   * @param {unknown} enabled - the switch's value.
   * @returns {ReturnType<typeof snapshot>} the persisted preferences.
   * @throws {RemoteAccessError} when the value or the write is invalid.
   */
  function setSidebarEntry(enabled) {
    if (typeof enabled !== 'boolean') {
      throw new RemoteAccessError('invalid-preference', 'sidebarEntry must be a boolean.', 400);
    }
    const next = { ...value, sidebarEntry: enabled };
    const document = {
      ...unknown,
      version: 1,
      ...next,
      updatedAt: new Date().toISOString(),
    };
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const temporary = path.join(dir, `.preferences.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`);
      fs.writeFileSync(temporary, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600 });
      fs.renameSync(temporary, file);
      fs.chmodSync(file, 0o600);
    } catch (error) {
      throw new RemoteAccessError('preference-store-write-failed', `Could not save the panel preferences: ${messageOf(error)}`);
    }
    value = next;
    warnings = [];
    updatedAt = document.updatedAt;
    return snapshot();
  }

  /** @returns {{ sidebarEntry: boolean, file: string, updatedAt: string | null, warnings: string[] }} */
  function snapshot() {
    return {
      ...value,
      file,
      updatedAt,
      warnings: [...warnings],
    };
  }

  return { file, setSidebarEntry, reload: load, snapshot };
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
