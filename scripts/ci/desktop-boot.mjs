/**
 * CI-only boot of the Electron-owned `desktop` profile without Electron.
 *
 * The public `dsh` CLI refuses `--profile desktop` ("managed exclusively by the
 * Electron application"), so the desktop host calls the same exported
 * `runProfile` entry this script calls, with the same arguments the Electron
 * shell passes: an OS-assigned loopback port and no browser handoff. Everything
 * the remote-access plugin touches — the profile name, the composed bundle
 * tree, the Web listener — is therefore the desktop one; only the native
 * window, its IPC carriers, and the packaged `dsh-app://` document are absent,
 * and none of them participate in remote access.
 *
 * The process stays alive until it receives SIGTERM/SIGINT, which `runProfile`
 * already routes through the profile's graceful shutdown.
 *
 * Required environment:
 *   DSH_HOME          throwaway Harness home holding `profiles/desktop`
 *   DSH_INSTALL_ROOT  installed `@deepseek-ai/dsh` package directory
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const installRoot = process.env.DSH_INSTALL_ROOT;
if (!installRoot) throw new Error('DSH_INSTALL_ROOT must point at the installed @deepseek-ai/dsh package');
if (!process.env.DSH_HOME) throw new Error('DSH_HOME must name a throwaway Harness home');

const { runProfile } = await import(pathToFileURL(path.join(installRoot, 'lib', 'profile-boot.js')).href);

await runProfile({
  environment: process.env,
  profile: 'desktop',
  patchFiles: [],
  args: ['--no-open', '--host', '127.0.0.1', '--port', '0'],
});
