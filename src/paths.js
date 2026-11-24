import os from 'node:os';
import path from 'node:path';

/** Absolute harness data directory, matching the Host's own DSH_HOME. */
export function dshHome() {
  const configured = process.env.DSH_HOME?.trim();
  return configured ? path.resolve(configured) : path.join(os.homedir(), '.dsh');
}

/** Plugin-owned runtime-data directory (device allow-list only). */
export function dataDir() {
  return path.join(dshHome(), 'tailcat-remote');
}

/** Default Unix-domain door socket inside the harness data directory. */
export function defaultSocketPath() {
  return path.join(dshHome(), 'tailcat-remote.sock');
}

/** The platform user-config directory tailcat uses for saved keys. */
export function userConfigDir() {
  const configured = process.env.XDG_CONFIG_HOME?.trim();
  return configured ? path.resolve(configured) : path.join(os.homedir(), '.config');
}

/**
 * Resolve a tailcat key name or path to the saved-key file tailcat reads.
 * A name maps to `<user config>/tailcat/keys/<name>.private.json`; a value
 * carrying a separator is treated as a path, matching tailcat's own rule.
 * @param {string} keyName - configured key name or path.
 * @returns {string} absolute key file path.
 */
export function tailcatKeyPath(keyName) {
  if (keyName.includes('/') || keyName.includes(path.sep)) {
    return path.isAbsolute(keyName) ? keyName : path.resolve(os.homedir(), keyName);
  }
  return path.join(userConfigDir(), 'tailcat', 'keys', `${keyName}.private.json`);
}

/**
 * The local endpoint the door listens on and tailcat maps its virtual port to.
 * @param {{ listen: 'socket' | 'tcp', port: number, socketPath: string }} config - resolved config.
 * @returns {{ mode: 'socket', socketPath: string } | { mode: 'tcp', port: number }} endpoint.
 */
export function doorEndpoint(config) {
  if (config.listen === 'tcp') return { mode: 'tcp', port: config.port };
  return { mode: 'socket', socketPath: config.socketPath || defaultSocketPath() };
}
