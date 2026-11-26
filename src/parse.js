/**
 * Pure parsers and argv builders for the tailcat supervisor, the door, and
 * their tests. Nothing here touches a socket or the Cordis context.
 */

/**
 * Parse tailcat's printed listening line.
 * @param {string} line - one stderr line.
 * @returns {{ mode: 'saved' | 'ephemeral', keyName?: string, address: string } | null}
 */
export function parseAddressLine(line) {
  const match = /Server listening with (?:saved key "([^"]+)"|new address):\s*(\S+)/.exec(line);
  if (!match) return null;
  const address = match[2].trim();
  if (!address.startsWith('tc')) return null;
  return match[1] === undefined
    ? { mode: 'ephemeral', address }
    : { mode: 'saved', keyName: match[1], address };
}

/**
 * Parse the selected bootstrap relay region line.
 * @param {string} line - one stderr line.
 * @returns {{ id: number, name: string } | null}
 */
export function parseRegionLine(line) {
  const match = /Selected bootstrap relay region (\d+),\s*(.+?)\s*$/.exec(line);
  if (!match) return null;
  return { id: Number(match[1]), name: match[2] };
}

/**
 * Parse one `--log` access record. Lines begin with the standard Go log
 * timestamp; the tagged record is searched anywhere in the line.
 * @param {string} line - one stderr line.
 * @returns {object | null} structured record, or null when the line is not one.
 */
export function parseAccessLine(line) {
  const match = /\[(peer|conn)\]\s+(allowed|refused|open|close)\b(.*)$/.exec(line);
  if (!match) return null;
  const tag = match[1];
  const event = match[2];
  const fields = {};
  for (const field of match[3].matchAll(/([A-Za-z]+)=([^\s]+)/g)) fields[field[1]] = field[2];
  if (tag === 'peer') {
    return {
      kind: 'peer',
      decision: event,
      peer: fields.key ? sanitizePeer(fields.key) : 'unknown',
      reason: fields.reason ?? null,
    };
  }
  if (event === 'refused') {
    return {
      kind: 'connection',
      event: 'refused',
      peer: null,
      protocol: fields.proto ?? 'tcp',
      port: parsePort(fields.port),
      service: fields.service ?? 'forward',
    };
  }
  return {
    kind: 'connection',
    event,
    peer: fields.peer ? sanitizePeer(fields.peer) : 'unknown',
    protocol: fields.proto ?? 'tcp',
    port: parsePort(fields.port),
    service: fields.service ?? 'forward',
    via: fields.via ?? null,
    durationMs: fields.duration ? parseDurationMs(fields.duration) : null,
  };
}

/**
 * Shorten a node public key for display while keeping enough prefix and
 * suffix to distinguish devices.
 * @param {string} value - full `nodekey:<hex>` value.
 * @returns {string} shortened key.
 */
export function sanitizePeer(value) {
  const match = /^([a-z]+):([0-9a-fA-F]+)$/.exec(String(value));
  if (!match) return String(value);
  const [, kind, hex] = match;
  if (hex.length <= 16) return `${kind}:${hex}`;
  return `${kind}:${hex.slice(0, 8)}…${hex.slice(-4)}`;
}

/**
 * Parse a Go duration such as `8.104s`, `532ms`, or `1m3.2s`.
 * @param {string} value - duration text.
 * @returns {number | null} milliseconds, or null when unparsable.
 */
export function parseDurationMs(value) {
  const unit = { ns: 1e-6, 'µs': 1e-3, us: 1e-3, ms: 1, s: 1000, m: 60_000, h: 3_600_000 };
  let total = 0;
  let matched = false;
  for (const part of String(value).matchAll(/(\d+(?:\.\d+)?)(ns|µs|us|ms|s|m|h)/g)) {
    total += Number(part[1]) * unit[part[2]];
    matched = true;
  }
  return matched ? Math.round(total) : null;
}

/**
 * Build the argv for `tailcat serve`. Root flags (`--json`, `--derpmap-url`,
 * `--key`) precede the subcommand; serve flags follow it.
 * @param {object} input - resolved config plus allow-list.
 * @returns {string[]} argv with the executable first.
 */
export function buildServeArgs(input) {
  const argv = [input.binaryPath, '--json'];
  if (input.derpMapUrl) argv.push(`--derpmap-url=${input.derpMapUrl}`);
  argv.push(`--key=${input.addressMode === 'ephemeral' ? 'new' : input.keyName}`);
  argv.push('serve');
  if (input.logAccess) argv.push('--log');
  const allow = Array.isArray(input.allow) ? input.allow.filter((key) => typeof key === 'string' && key !== '') : [];
  if (allow.length > 0) argv.push(`--allow=${allow.join(',')}`);
  if (input.listen === 'tcp') {
    argv.push(`${input.port}:127.0.0.1:${input.port}`);
  } else {
    if (!input.socketPath) throw new Error('buildServeArgs: socketPath is required in socket mode');
    argv.push(`${input.port}:${input.socketPath}`);
  }
  return argv;
}

/**
 * Build the argv for one-shot `tailcat genkey`.
 * @param {{ binaryPath: string, keyName: string, derpMapUrl?: string, force?: boolean }} input - key facts.
 * @returns {string[]} argv with the executable first.
 */
export function buildGenkeyArgs(input) {
  const argv = [input.binaryPath];
  if (input.derpMapUrl) argv.push(`--derpmap-url=${input.derpMapUrl}`);
  argv.push('genkey');
  if (input.force) argv.push('--force');
  argv.push(`--key=${input.keyName}`, '--fixed-region');
  return argv;
}

/**
 * The command a client machine runs to expose the door on its own loopback.
 * @param {string} address - tailcat server address.
 * @param {number} port - virtual port inside the tunnel.
 * @param {number} [localPort] - local browser port to bind.
 * @returns {string} shell command.
 */
export function buildForwardCommand(address, port, localPort = 18_080) {
  return `tailcat forward ${address} ${localPort}:${port}`;
}

/**
 * Index of the first byte after the HTTP header block, or -1 when the block
 * is still incomplete.
 * @param {Buffer} buffer - accumulated bytes.
 * @returns {number} body offset.
 */
export function headerEnd(buffer) {
  const crlf = buffer.indexOf('\r\n\r\n');
  if (crlf !== -1) return crlf + 4;
  const lf = buffer.indexOf('\n\n');
  return lf === -1 ? -1 : lf + 2;
}

/**
 * Parse a raw HTTP/1.x request head. Node's HTTP parser is not involved on
 * the raw door path, so this only needs the request line and header map.
 * @param {Buffer} buffer - bytes containing at least the header block.
 * @returns {{ method: string, target: string, path: string, tokenPresent: boolean, headers: Record<string, string> } | null}
 */
export function parseRequestHead(buffer) {
  const end = headerEnd(buffer);
  if (end === -1) return null;
  const lines = buffer.subarray(0, end).toString('latin1').split(/\r?\n/);
  const requestLine = lines.shift() ?? '';
  const request = /^(\S+)\s+(\S+)\s+HTTP\/\d(?:\.\d)?$/i.exec(requestLine);
  if (!request) return null;
  const method = request[1].toUpperCase();
  const target = request[2];
  let url;
  try {
    url = new URL(target, 'http://door.invalid');
  } catch {
    return null;
  }
  /** @type {Record<string, string>} */
  const headers = {};
  for (const line of lines) {
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (!name) continue;
    if (headers[name] === undefined) headers[name] = value;
    else if (name === 'cookie') headers[name] = `${headers[name]}; ${value}`;
    else headers[name] = `${headers[name]}, ${value}`;
  }
  return {
    method,
    target,
    path: url.pathname,
    tokenPresent: url.searchParams.has('token'),
    headers,
  };
}

/**
 * Whether a request is the one moment that may exchange the address for a
 * browser session: a top-level GET of `/` without a token parameter.
 * @param {ReturnType<typeof parseRequestHead>} head - parsed request.
 * @returns {boolean} true when the door should consider minting a cookie.
 */
export function isBootstrapRequest(head) {
  return head !== null && head.method === 'GET' && head.path === '/' && !head.tokenPresent;
}

/**
 * Scrub a tailcat address and node keys out of diagnostics before they reach
 * the Host log or the panel.
 * @param {string} line - raw line.
 * @returns {string} scrubbed, bounded text.
 */
export function sanitizeLine(line) {
  return String(line)
    .replace(/\btc[A-Za-z0-9+/=_-]{16,}/g, 'tc…')
    .replace(/nodekey:[0-9a-fA-F]{16,}/g, (value) => sanitizePeer(value))
    .trim()
    .slice(0, 500);
}

/**
 * @param {string | undefined} value - port text.
 * @returns {number | null} parsed port.
 */
function parsePort(value) {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  const port = Number(value);
  return port >= 0 && port <= 65_535 ? port : null;
}
