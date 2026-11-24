import { Config, resolveConfig } from './src/config.js';
import { registerControl } from './src/control.js';
import { errorMessage } from './src/errors.js';
import { RemoteAccess } from './src/remote.js';

/** Loader row identity; must match the id in cordis.patch.yml. */
export const name = 'dsh-tailcat-remote';

/** Host services the plugin requires before it can activate. */
export const inject = ['connection', 'webServer', 'subprocess'];

export { Config };

/**
 * Mount the remote-access page and its tailcat runtime.
 * @param {object} ctx - Host plugin context.
 * @param {object} [rawConfig] - validated config from the Loader row.
 */
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig);
  const remote = new RemoteAccess(ctx, config);

  ctx.effect(() => registerControl(ctx, remote), 'tailcat-remote: control route');
  ctx.effect(() => {
    void remote.start().catch((error) => {
      ctx.logger.warn(`tailcat-remote: activation failed: ${errorMessage(error)}`);
    });
    return () => {
      void remote.dispose().catch((error) => {
        ctx.logger.warn(`tailcat-remote: shutdown failed: ${errorMessage(error)}`);
      });
    };
  }, 'tailcat-remote: runtime');
}
