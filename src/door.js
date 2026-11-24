import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { RemoteAccessError, errorMessage } from './errors.js';
import { doorEndpoint } from './paths.js';
import { headerEnd, isBootstrapRequest, parseRequestHead } from './parse.js';

const MAX_HEADER_BYTES = 32 * 1024;
const HEADER_TIMEOUT_MS = 10_000;
const UPSTREAM_TIMEOUT_MS = 10_000;
/**
 * Probe an existing Unix socket before taking it over. A socket left by a
 * crash refuses connections; one owned by a live process accepts them.
 * @param {string} socketPath - path from the config.
 * @returns {Promise<boolean>} whether another listener answered.
 */
function socketIsLive(socketPath) {
  return new Promise((resolve) => {
    let settled = false;
    const probe = net.connect(socketPath);
    const finish = (live) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      probe.destroy();
      resolve(live);
    };
    const timer = setTimeout(() => finish(false), 300);
    timer.unref?.();
    probe.once('connect', () => finish(true));
    probe.once('error', () => finish(false));
  });
}

const STATUS_TEXT = {
  303: 'See Other',
  400: 'Bad Request',
  403: 'Forbidden',
  408: 'Request Timeout',
  413: 'Payload Too Large',
  431: 'Request Header Fields Too Large',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

/**
 * The tailnet-only door. tailcat maps its virtual port onto this local
 * endpoint; the door lets a peer with the tailcat address exchange that
 * address for the ordinary DSH browser session cookie. Every other request
 * (assets, API, WebSocket upgrades) is a raw byte splice to the real Web
 * listener, preserving the Host header and the bytes on the wire.
 */
export class Door {
  /**
   * @param {object} ctx - Host plugin context.
   * @param {ReturnType<import('./config.js').resolveConfig>} config - resolved config.
   * @param {any} logger - Host logger.
   */
  constructor(ctx, config, logger) {
    this.ctx = ctx;
    this.config = config;
    this.logger = logger;
    this.endpoint = doorEndpoint(config);
    this.server = null;
    this.sockets = new Set();
    this.phase = 'stopped';
    this.lastError = null;
    this.createdSocket = false;
    this.disposed = false;
  }

  /** Bind the local endpoint and start accepting tailcat connections. */
  async start() {
    if (this.server) return;
    this.disposed = false;
    const web = this.ctx.webServer;
    if (web.protocol !== 'http:') {
      throw new RemoteAccessError(
        'door-tls-unsupported',
        'The door requires a plain-HTTP Web listener. The current listener serves HTTPS, so the DSH browser cookie could not be replayed through tailcat.',
        409,
      );
    }
    await this.waitForWebPort();
    this.lastError = null;
    this.phase = 'starting';
    if (this.endpoint.mode === 'socket') await this.prepareSocket();
    const server = net.createServer((socket) => this.accept(socket));
    this.server = server;
    server.on('error', (error) => {
      this.lastError = errorMessage(error);
      this.logger.warn(`tailcat-remote: door error: ${this.lastError}`);
    });
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => reject(error);
        server.once('error', onError);
        const listenOptions =
          this.endpoint.mode === 'socket'
            ? { path: this.endpoint.socketPath }
            : { host: '127.0.0.1', port: this.endpoint.port };
        server.listen(listenOptions, () => {
          server.off('error', onError);
          resolve();
        });
      });
    } catch (error) {
      this.server = null;
      try {
        server.close();
      } catch {
        // The listener never bound; closing is best-effort.
      }
      this.phase = 'error';
      this.lastError = errorMessage(error);
      this.removeSocket();
      throw new RemoteAccessError(
        'door-listen-failed',
        `Could not start the tailcat door on ${
          this.endpoint.mode === 'socket' ? this.endpoint.socketPath : `127.0.0.1:${this.endpoint.port}`
        }: ${errorMessage(error)}`,
        503,
      );
    }
    if (this.endpoint.mode === 'socket') {
      try {
        fs.chmodSync(this.endpoint.socketPath, 0o600);
      } catch (error) {
        this.logger.warn(`tailcat-remote: could not restrict the door socket mode: ${errorMessage(error)}`);
      }
    }
    this.phase = 'listening';
    this.logger.info(
      `tailcat-remote: door listening on ${
        this.endpoint.mode === 'socket' ? this.endpoint.socketPath : `127.0.0.1:${this.endpoint.port}`
      }`,
    );
  }

  /** Stop accepting connections and remove the owned Unix socket. */
  async stop() {
    const server = this.server;
    this.server = null;
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    if (server) {
      await new Promise((resolve) => {
        let settled = false;
        const done = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        try {
          server.close(done);
        } catch {
          done();
        }
      });
    }
    this.removeSocket();
    this.phase = 'stopped';
  }

  /** @returns {object} display-safe state. */
  snapshot() {
    const target = this.targetOrNull();
    return {
      phase: this.phase,
      listening: this.phase === 'listening',
      mode: this.endpoint.mode,
      socketPath: this.endpoint.mode === 'socket' ? this.endpoint.socketPath : null,
      port: this.endpoint.mode === 'tcp' ? this.endpoint.port : null,
      target,
      lastError: this.lastError,
    };
  }

  /** @private */
  async waitForWebPort() {
    const deadline = Date.now() + 20_000;
    while (this.ctx.webServer.port === undefined) {
      if (this.disposed) throw new RemoteAccessError('disposed', 'The remote-access runtime is shutting down.');
      if (Date.now() > deadline) {
        throw new RemoteAccessError(
          'web-not-listening',
          'The Web listener did not report a port within 20 seconds; the tailcat door cannot start.',
          503,
        );
      }
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 50);
        timer.unref?.();
      });
    }
  }

  /** @private */
  async prepareSocket() {
    const socketPath = this.endpoint.socketPath;
    const existing = fs.lstatSync(socketPath, { throwIfNoEntry: false });
    if (existing) {
      if (!existing.isSocket()) {
        throw new RemoteAccessError(
          'door-path-occupied',
          `The configured door path ${socketPath} exists and is not a Unix socket; refusing to remove it.`,
          409,
        );
      }
      if (await socketIsLive(socketPath)) {
        throw new RemoteAccessError(
          'door-in-use',
          `Another process is already accepting connections on ${socketPath}; refusing to remove its door socket.`,
          409,
        );
      }
      fs.unlinkSync(socketPath);
    }
    const parent = path.dirname(socketPath);
    fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
    this.createdSocket = true;
  }

  /** @private */
  removeSocket() {
    if (!this.createdSocket || this.endpoint.mode !== 'socket') return;
    this.createdSocket = false;
    try {
      fs.unlinkSync(this.endpoint.socketPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        this.logger.warn(`tailcat-remote: could not remove the door socket: ${errorMessage(error)}`);
      }
    }
  }

  /** @private */
  accept(socket) {
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    socket.setNoDelay(true);
    socket.pause();

    const chunks = [];
    let size = 0;
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.off('data', onData);
      socket.pause();
    };
    const onData = (chunk) => {
      chunks.push(chunk);
      size += chunk.length;
      const buffer = Buffer.concat(chunks, size);
      if (headerEnd(buffer) !== -1) {
        settle();
        this.dispatch(socket, buffer);
        return;
      }
      if (size > MAX_HEADER_BYTES) {
        settle();
        this.respond(socket, 431, 'Request header fields too large\n');
      }
    };
    const onClose = () => {
      settle();
    };
    const timer = setTimeout(() => {
      if (settled) return;
      settle();
      this.respond(socket, 408, 'Request timed out\n');
    }, HEADER_TIMEOUT_MS);
    timer.unref?.();
    socket.on('data', onData);
    socket.on('close', onClose);
    socket.resume();
  }

  /** @private */
  dispatch(socket, buffer) {
    const head = parseRequestHead(buffer);
    if (!head) {
      this.respond(socket, 400, 'Bad request\n');
      return;
    }
    if (!isBootstrapRequest(head)) {
      this.splice(socket, buffer);
      return;
    }
    let rejection;
    try {
      rejection = this.ctx.connection.requestRejection({
        method: head.method,
        url: head.target,
        headers: head.headers,
      });
    } catch (error) {
      this.logger.warn(`tailcat-remote: door trust check failed: ${errorMessage(error)}`);
      this.respond(socket, 400, 'Bad request\n');
      return;
    }
    if (rejection === 403) {
      this.respond(socket, 403, 'Forbidden\n');
      return;
    }
    if (rejection === undefined) {
      this.splice(socket, buffer);
      return;
    }
    if (rejection !== 401) {
      this.respond(socket, 400, 'Bad request\n');
      return;
    }
    this.mintCookie(socket, head);
  }

  /** @private */
  mintCookie(socket, head) {
    if (!head.headers.host) {
      this.respond(socket, 400, 'Bad request\n');
      return;
    }
    let token;
    try {
      token = this.launchToken();
    } catch (error) {
      this.logger.warn(`tailcat-remote: could not read the launch token: ${errorMessage(error)}`);
      this.respond(socket, 500, 'Internal error\n');
      return;
    }
    const capture = {
      status: 0,
      headers: {},
      body: Buffer.alloc(0),
      writeHead(status, headers) {
        this.status = status;
        this.headers = headers && typeof headers === 'object' ? headers : {};
      },
      end(chunk) {
        if (chunk !== undefined && chunk !== null) this.body = Buffer.from(chunk);
      },
    };
    try {
      const authenticated = this.ctx.connection.authorizeIndex(
        { method: 'GET', url: `/?token=${encodeURIComponent(token)}`, headers: { host: head.headers.host } },
        capture,
      );
      if (authenticated) {
        this.respond(socket, 401, 'Unauthorized\n');
        return;
      }
    } catch (error) {
      this.logger.warn(`tailcat-remote: door cookie mint failed: ${errorMessage(error)}`);
      this.respond(socket, 500, 'Internal error\n');
      return;
    }
    if (capture.status !== 303) {
      this.respond(socket, 401, 'Unauthorized\n');
      return;
    }
    const lines = [`HTTP/1.1 303 ${STATUS_TEXT[303]}`];
    for (const [name, value] of Object.entries(capture.headers)) {
      const lower = name.toLowerCase();
      if (lower === 'content-length' || lower === 'connection') continue;
      if (Array.isArray(value)) {
        for (const item of value) lines.push(`${name}: ${item}`);
      } else {
        lines.push(`${name}: ${value}`);
      }
    }
    lines.push('content-length: 0', 'connection: close');
    socket.end(`${lines.join('\r\n')}\r\n\r\n`);
  }

  /** @private */
  launchToken() {
    this.cachedToken ??= new URL(this.ctx.connection.authenticatedUrl('http://door.invalid/')).searchParams.get('token');
    if (!this.cachedToken) throw new Error('the Connection service did not publish a launch token');
    return this.cachedToken;
  }

  /** @private */
  splice(socket, buffer) {
    let target;
    try {
      target = this.target();
    } catch (error) {
      this.respond(socket, 503, 'Service unavailable\n');
      this.logger.warn(`tailcat-remote: ${errorMessage(error)}`);
      return;
    }
    const upstream = net.connect({ host: target.host, port: target.port, allowHalfOpen: false });
    let connected = false;
    upstream.setNoDelay?.(true);
    const timer = setTimeout(() => {
      if (connected) return;
      upstream.destroy();
      this.respond(socket, 504, 'Upstream timed out\n');
    }, UPSTREAM_TIMEOUT_MS);
    timer.unref?.();
    upstream.once('connect', () => {
      connected = true;
      clearTimeout(timer);
      upstream.setNoDelay(true);
      upstream.write(buffer);
      socket.resume();
      socket.pipe(upstream);
      upstream.pipe(socket);
    });
    upstream.on('error', (error) => {
      clearTimeout(timer);
      if (!connected) {
        this.logger.warn(`tailcat-remote: door upstream failed: ${errorMessage(error)}`);
        this.respond(socket, 502, 'Bad gateway\n');
      } else {
        socket.destroy();
      }
    });
    upstream.on('close', () => clearTimeout(timer));
    socket.on('close', () => {
      clearTimeout(timer);
      upstream.destroy();
    });
    socket.on('error', () => {
      clearTimeout(timer);
      upstream.destroy();
    });
  }

  /** @private */
  target() {
    const web = this.ctx.webServer;
    if (web.port === undefined) throw new RemoteAccessError('web-not-listening', 'The Web listener has no port.');
    let host = web.host;
    if (host === '0.0.0.0') host = '127.0.0.1';
    else if (host === '::') host = '::1';
    return { host, port: web.port };
  }

  /** @private */
  targetOrNull() {
    try {
      return this.target();
    } catch {
      return null;
    }
  }

  /** @private */
  respond(socket, status, body) {
    if (socket.destroyed || !socket.writable) {
      socket.destroy();
      return;
    }
    const payload = Buffer.from(body);
    socket.end(
      `HTTP/1.1 ${status} ${STATUS_TEXT[status] ?? 'Error'}\r\n` +
        'content-type: text/plain; charset=utf-8\r\n' +
        'cache-control: no-store\r\n' +
        'referrer-policy: no-referrer\r\n' +
        `content-length: ${payload.length}\r\n` +
        'connection: close\r\n\r\n' +
        payload.toString('utf8'),
    );
  }
}
