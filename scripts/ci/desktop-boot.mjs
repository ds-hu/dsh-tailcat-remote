/**
 * CI-only boot of the Electron-owned `desktop` profile without Electron.
 *
 * The public `dsh` CLI refuses `--profile desktop` ("managed exclusively by the
 * Electron application"), so this script calls the same exported entries the
 * desktop carrier calls, in the same order:
 *
 *   loadLayeredEnv('dsh')  →  loadProfileDirectory(...)  →  runProfile(...)
 *
 * with the desktop's exact profile name and arguments (loopback, OS-assigned
 * port, no browser handoff). Everything the remote-access plugin touches — the
 * profile name, the composed bundle tree, the Web listener — is therefore the
 * desktop one; only the native window, its IPC carriers, and the packaged
 * `dsh-app://` document are absent, and none of them participate in remote
 * access.
 *
 * The process stays alive until it receives SIGTERM/SIGINT, which `runProfile`
 * already routes through the profile's graceful shutdown.
 *
 * Required environment:
 *   DSH_HOME          throwaway Harness home holding `profiles/desktop`
 *   DSH_INSTALL_ROOT  installed `@deepseek-ai/dsh` package directory
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const installRoot = process.env.DSH_INSTALL_ROOT;
if (!installRoot) throw new Error('DSH_INSTALL_ROOT must point at the installed @deepseek-ai/dsh package');
if (!process.env.DSH_HOME) throw new Error('DSH_HOME must name a throwaway Harness home');

// Resolve the two packages through the installation itself, so the script uses
// the same copies and versions the CLI and the desktop carrier would load.
const requireFromInstallation = createRequire(path.join(installRoot, 'package.json'));
const modules = [
  await import(pathToFileURL(requireFromInstallation.resolve('@deepseek-ai/dsh-app-boot')).href),
  await import(pathToFileURL(requireFromInstallation.resolve('@deepseek-ai/dsh/profile-boot')).href),
];
const [{ loadLayeredEnv, loadProfileDirectory, reportSkippedBundles }, { runProfile }] = modules;

const installAnchor = path.join(installRoot, 'package.json');
const profile = loadProfileDirectory('dsh', path.join(process.env.DSH_HOME, 'profiles', 'desktop'), installAnchor);
reportSkippedBundles('dsh', profile);

await runProfile({
  environment: loadLayeredEnv('dsh'),
  profile: 'desktop',
  resolvedProfile: { profile, installAnchor },
  patchFiles: [],
  args: ['--no-open', '--host', '127.0.0.1', '--port', '0'],
});
