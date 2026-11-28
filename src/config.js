import z from '@deepseek-ai/schemastery';

/** Virtual port tailcat exposes to clients. */
export const DEFAULT_PORT = 13080;

/** Windows has no Unix-domain socket support in tailcat; use loopback TCP there. */
export const DEFAULT_LISTEN = process.platform === 'win32' ? 'tcp' : 'socket';

/**
 * Host config. Every field is optional; the defaults describe the secure
 * common case: a Unix-socket door under DSH_HOME (loopback TCP on Windows,
 * where tailcat has no Unix-socket target support), a saved stable key, and
 * no device-key allow-list (the address stays the only credential).
 */
export const Config = z.object({
  binaryPath: z
    .string()
    .default('tailcat')
    .description('The tailcat executable: a PATH name or an absolute path. The panel reports it when it cannot be found.'),
  port: z
    .natural()
    .min(1)
    .max(65535)
    .default(DEFAULT_PORT)
    .description('Virtual port inside the tailcat tunnel. Clients reach the Harness on this port; it is not opened on this machine.'),
  listen: z
    .union([z.const('socket'), z.const('tcp')])
    .default(DEFAULT_LISTEN)
    .description(
      'Where the door listens locally. socket creates a 0600 Unix socket under DSH_HOME and is reachable only by tailcat; it is unsupported on Windows. tcp binds 127.0.0.1 and is also reachable by any local process. Windows defaults to tcp.',
    ),
  socketPath: z
    .string()
    .default('')
    .description('Door socket path when listen is socket. Empty uses $DSH_HOME/tailcat-remote.sock.'),
  keyName: z
    .string()
    .default('dsh-tailcat')
    .description('Saved tailcat server-key name (or a path containing a slash). A saved key keeps the tailcat address stable across restarts.'),
  addressMode: z
    .union([z.const('stable'), z.const('ephemeral')])
    .default('stable')
    .description(
      'stable uses the saved key and keeps the address until you rotate it. ephemeral asks tailcat for a new key on every start, so the address changes after every restart.',
    ),
  derpMapUrl: z
    .string()
    .default('')
    .description('Custom DERP map URL. Empty uses the tailcat default.'),
  autoStart: z.boolean().default(true).description('Start the tunnel when the Host plugin activates.'),
  logAccess: z
    .boolean()
    .default(true)
    .description('Ask tailcat for its access log so the panel can show recent connections and refusals.'),
  restartEnabled: z.boolean().default(true).description('Restart tailcat after an unexpected exit.'),
  maxRestartAttempts: z.natural().min(0).max(100).default(10).description('Consecutive automatic restart attempts before the tunnel stays stopped in the error state.'),
  restartBaseDelayMs: z.natural().min(100).max(60_000).default(500).description('First restart delay in milliseconds; later attempts double it.'),
  restartMaxDelayMs: z.natural().min(1_000).max(600_000).default(30_000).description('Upper bound for one automatic restart delay in milliseconds.'),
});

/**
 * Turn a validated (or absent) config into the normalized shape the runtime
 * reads. Kept independent from the schema so a malformed row still produces
 * safe defaults instead of throwing during activation.
 * @param {Partial<import('@deepseek-ai/schemastery').Schema>} [input] - raw config.
 * @returns {object} resolved config.
 */
export function resolveConfig(input) {
  const value = input && typeof input === 'object' ? input : {};
  const port = Number.isInteger(value.port) && value.port >= 1 && value.port <= 65535 ? value.port : DEFAULT_PORT;
  const maxRestartAttempts =
    Number.isInteger(value.maxRestartAttempts) && value.maxRestartAttempts >= 0
      ? Math.min(value.maxRestartAttempts, 100)
      : 10;
  const restartBaseDelayMs =
    Number.isInteger(value.restartBaseDelayMs) && value.restartBaseDelayMs >= 100
      ? Math.min(value.restartBaseDelayMs, 60_000)
      : 500;
  const restartMaxDelayMs =
    Number.isInteger(value.restartMaxDelayMs) && value.restartMaxDelayMs >= 1_000
      ? Math.min(value.restartMaxDelayMs, 600_000)
      : 30_000;

  return {
    binaryPath: nonEmpty(value.binaryPath) ?? 'tailcat',
    port,
    listen: value.listen === 'tcp' ? 'tcp' : value.listen === 'socket' ? 'socket' : DEFAULT_LISTEN,
    socketPath: nonEmpty(value.socketPath) ?? '',
    keyName: nonEmpty(value.keyName) ?? 'dsh-tailcat',
    addressMode: value.addressMode === 'ephemeral' ? 'ephemeral' : 'stable',
    derpMapUrl: nonEmpty(value.derpMapUrl) ?? '',
    autoStart: value.autoStart !== false,
    logAccess: value.logAccess !== false,
    restartEnabled: value.restartEnabled !== false,
    maxRestartAttempts,
    restartBaseDelayMs,
    restartMaxDelayMs: Math.max(restartBaseDelayMs, restartMaxDelayMs),
  };
}

/**
 * The subset of settings the panel may show. No key material, no resolved
 * private paths, no address.
 * @param {ReturnType<typeof resolveConfig>} config - resolved config.
 * @returns {object} display-safe settings.
 */
export function configView(config) {
  return {
    binaryPath: config.binaryPath,
    port: config.port,
    listen: config.listen,
    keyName: config.keyName,
    addressMode: config.addressMode,
    autoStart: config.autoStart,
    logAccess: config.logAccess,
    restartEnabled: config.restartEnabled,
    maxRestartAttempts: config.maxRestartAttempts,
    restartBaseDelayMs: config.restartBaseDelayMs,
    restartMaxDelayMs: config.restartMaxDelayMs,
    customDerpMap: config.derpMapUrl !== '',
  };
}

/**
 * @param {unknown} value - candidate.
 * @returns {string | undefined} trimmed non-empty text.
 */
function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}
