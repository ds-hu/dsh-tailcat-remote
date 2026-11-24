import { RemoteAccessError, errorMessage } from './errors.js';

/** Exact authenticated Fetch route owned by this plugin. */
export const ROUTE = '/api/tailcat-remote';

const MAX_BODY_BYTES = 64 * 1024;
const HEADERS = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

/**
 * Register the owner-only control route.
 * @param {object} ctx - Host plugin context.
 * @param {import('./remote.js').RemoteAccess} remote - runtime.
 * @returns {() => void} route disposer.
 */
export function registerControl(ctx, remote) {
  return ctx.connection.fetch.register({
    path: ROUTE,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: async (request) => {
      try {
        if (request.method === 'GET') return json({ ok: true, ...remote.snapshot() });
        if (request.method !== 'POST') return json({ ok: false, error: { code: 'method', message: 'Use GET or POST.' } }, 405);
        const text = await request.text();
        if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
          return json({ ok: false, error: { code: 'body-too-large', message: 'Request body is too large.' } }, 413);
        }
        let body;
        try {
          body = JSON.parse(text);
        } catch {
          return json({ ok: false, error: { code: 'invalid-json', message: 'Request body must be JSON.' } }, 400);
        }
        const action = body?.action;
        let result;
        switch (action) {
          case 'start':
            result = await remote.startTunnel();
            break;
          case 'stop':
            result = await remote.stopTunnel();
            break;
          case 'restart':
            result = await remote.restartTunnel();
            break;
          case 'rotate':
            result = await remote.rotateAddress();
            break;
          case 'devices':
            result = await remote.saveDevices(body.allow);
            break;
          default:
            return json(
              { ok: false, error: { code: 'unknown-action', message: `Unknown action ${JSON.stringify(action)}.` } },
              400,
            );
        }
        return json({ ok: true, ...result });
      } catch (error) {
        const status = error instanceof RemoteAccessError ? error.status : 500;
        const code = error instanceof RemoteAccessError ? error.code : 'internal';
        if (status >= 500) ctx.logger.warn(`tailcat-remote: control action failed: ${errorMessage(error)}`);
        return json({ ok: false, error: { code, message: errorMessage(error) } }, status);
      }
    },
  });
}

/**
 * @param {object} data - JSON payload.
 * @param {number} [status] - HTTP status.
 * @returns {Response} JSON response.
 */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: HEADERS });
}
