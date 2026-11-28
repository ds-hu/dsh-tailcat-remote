import fs from 'node:fs';
import { RemoteAccessError, errorMessage } from './errors.js';
import { configView } from './config.js';
import { createDeviceStore } from './devices.js';
import { createPreferenceStore } from './preferences.js';
import { Door } from './door.js';
import { buildForwardCommand } from './parse.js';
import { qrMatrix } from './qr.js';
import { TailcatInstaller } from './installer.js';
import { surfaceOf } from './surface.js';
import { TailcatSupervisor } from './tailcat.js';

const LOCAL_CLIENT_PORT = 18_080;
const plugin = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/**
 * Owns the door and the supervisor for one Host plugin instance, and exposes
 * the read model and operations the panel uses. Mutating operations are
 * serialized so two clicks cannot start two tailcat processes.
 */
export class RemoteAccess {
  /**
   * @param {object} ctx - Host plugin context.
   * @param {ReturnType<import('./config.js').resolveConfig>} config - resolved config.
   */
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.logger = ctx.logger;
    this.surface = surfaceOf(ctx);
    this.devices = createDeviceStore({ logger: ctx.logger });
    this.preferences = createPreferenceStore({ logger: ctx.logger });
    this.installer = new TailcatInstaller(ctx, {
      logger: ctx.logger,
      releaseTag: `v${plugin.version}`,
      requestedBinary: config.binaryPath,
    });
    this.tailcat = new TailcatSupervisor(ctx, config, {
      devices: this.devices,
      logger: ctx.logger,
      installer: this.installer,
    });
    this.door = new Door(ctx, config, ctx.logger);
    this.ops = Promise.resolve();
    this.startPromise = null;
    this.started = false;
    this.disposed = false;
    this.qrCache = null;
  }

  /** Activate the door, then optionally start the tunnel. */
  start() {
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.enqueue(() => this.activate()).finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  /** @private */
  async activate() {
    if (this.started) return this.snapshot();
    this.started = true;
    try {
      await this.door.start();
    } catch (error) {
      this.door.phase = 'error';
      this.door.lastError = errorMessage(error);
      this.logger.warn(`tailcat-remote: door unavailable: ${errorMessage(error)}`);
    }
    try {
      await this.installer.detectSystem();
    } catch (error) {
      this.logger.warn(`tailcat-remote: could not inspect an existing tailcat: ${errorMessage(error)}`);
    }
    if (this.config.autoStart && this.door.phase === 'listening') {
      try {
        await this.tailcat.start();
      } catch (error) {
        this.logger.warn(`tailcat-remote: tunnel did not start: ${errorMessage(error)}`);
      }
    }
    return this.snapshot();
  }

  /** Start the tunnel, bringing the door up first if necessary. */
  startTunnel() {
    return this.enqueue(async () => {
      await this.ensureDoor();
      await this.installer.detectSystem();
      await this.tailcat.start();
      return this.snapshot();
    });
  }

  /** Stop the tunnel; the door stays bound for a later start. */
  stopTunnel() {
    return this.enqueue(async () => {
      await this.tailcat.stop();
      return this.snapshot();
    });
  }

  /** Restart the tunnel with the current settings and allow-list. */
  restartTunnel() {
    return this.enqueue(async () => {
      await this.ensureDoor();
      await this.installer.detectSystem();
      await this.tailcat.restart();
      return this.snapshot();
    });
  }

  /** Replace the tailcat address and wait until the new server is online. */
  rotateAddress() {
    return this.enqueue(async () => {
      await this.ensureDoor();
      await this.installer.detectSystem();
      await this.tailcat.rotate();
      return this.snapshot();
    });
  }

  /**
   * Replace the device allow-list. Persisting the list is the primary
   * operation; a running tunnel is restarted so tailcat applies it. A restart
   * failure leaves the saved list in place and surfaces through status.
   * @param {string[]} allow - canonical or paste-ready keys.
   */
  saveDevices(allow) {
    return this.enqueue(async () => {
      this.devices.replace(allow);
      if (this.tailcat.desired || this.tailcat.handle) {
        try {
          await this.installer.detectSystem();
          await this.tailcat.restart();
        } catch (error) {
          this.logger.warn(`tailcat-remote: allow-list saved but tailcat did not restart: ${errorMessage(error)}`);
        }
      }
      return this.snapshot();
    });
  }

  /**
   * Persist one panel preference. Nothing restarts: the sidebar row is a client
   * registration, so the page picks the change up on its next load.
   * @param {unknown} sidebarEntry - whether the sidebar keeps the shortcut row.
   */
  saveSidebarEntry(sidebarEntry) {
    return this.enqueue(async () => {
      this.preferences.setSidebarEntry(sidebarEntry);
      return this.snapshot();
    });
  }

  /**
   * Install the plugin-managed tailcat, then restore the previous desired
   * tunnel state. A pre-existing user-installed tailcat is never modified.
   * @param {{force?: boolean}} [options] - reinstall even when a managed copy exists.
   */
  installTailcat(options = {}) {
    return this.enqueue(async () => {
      if (this.config.binaryPath !== 'tailcat') {
        throw new RemoteAccessError(
          'tailcat-binary-overridden',
          `binaryPath is set to "${this.config.binaryPath}", so the managed install would not be used. Set binaryPath back to "tailcat" or install there manually.`,
          409,
        );
      }
      await this.installer.detectSystem();
      const wasDesired = this.tailcat.desired || Boolean(this.tailcat.handle);
      if (this.tailcat.handle) await this.tailcat.stop();
      try {
        await this.installer.install({ force: options.force === true });
      } catch (error) {
        if (wasDesired && !this.disposed) {
          try {
            await this.ensureDoor();
            await this.tailcat.start();
          } catch (restartError) {
            this.logger.warn(`tailcat-remote: could not restart the previous tailcat: ${errorMessage(restartError)}`);
          }
        }
        throw error;
      }
      this.tailcat.reloadBinary();
      if (wasDesired && !this.disposed) {
        try {
          await this.ensureDoor();
          await this.tailcat.start();
        } catch (error) {
          this.logger.warn(`tailcat-remote: installed tailcat but could not start it: ${errorMessage(error)}`);
        }
      }
      return this.snapshot();
    });
  }

  /** Stop both halves and release the plugin's resources. */
  async dispose() {
    this.disposed = true;
    this.installer.dispose();
    try {
      await this.ops;
    } catch {
      // A rejected operation already surfaced through its caller.
    }
    await this.tailcat.dispose();
    await this.door.stop();
    this.started = false;
  }

  /** @private */
  async ensureDoor() {
    if (this.door.phase === 'listening') return;
    try {
      await this.door.start();
    } catch (error) {
      this.door.phase = 'error';
      this.door.lastError = errorMessage(error);
      throw error;
    }
  }

  /** @returns {object} the complete read model sent to the panel. */
  snapshot() {
    const tailcat = this.tailcat.snapshot();
    const pairing = this.pairing(tailcat.address);
    return {
      plugin: { name: plugin.name, version: plugin.version },
      surface: this.surface,
      now: new Date().toISOString(),
      web: {
        protocol: this.ctx.webServer.protocol,
        port: this.ctx.webServer.port ?? null,
      },
      config: configView(this.config),
      door: this.door.snapshot(),
      tailcat,
      installer: this.installer.snapshot(),
      devices: this.devices.snapshot(),
      preferences: this.preferences.snapshot(),
      pairing,
      safety: {
        allowListEnforced: this.devices.snapshot().enforced,
        rotateRevokesBrowserSessions: false,
      },
    };
  }

  /** @private */
  pairing(address) {
    if (!address) return null;
    if (this.qrCache?.address !== address) {
      try {
        this.qrCache = { address, matrix: qrMatrix(address) };
      } catch (error) {
        this.logger.warn(`tailcat-remote: could not build the pairing QR: ${errorMessage(error)}`);
        this.qrCache = { address, matrix: null };
      }
    }
    return {
      address,
      port: this.config.port,
      localPort: LOCAL_CLIENT_PORT,
      command: buildForwardCommand(address, this.config.port, LOCAL_CLIENT_PORT),
      qr: this.qrCache.matrix,
    };
  }

  /**
   * @private
   * @param {() => Promise<unknown>} task - operation.
   * @returns {Promise<unknown>} task result.
   */
  enqueue(task) {
    if (this.disposed) {
      return Promise.reject(new RemoteAccessError('disposed', 'The remote-access runtime is shutting down.', 503));
    }
    const run = this.ops.then(task, task);
    this.ops = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

export { RemoteAccessError };
