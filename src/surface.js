/**
 * Which Harness surface hosts this plugin: a `dsh web` profile, the Electron
 * desktop profile, or neither (a bare Host context with no profile launcher).
 *
 * The profile name is read once at activation. It is launcher-owned and does
 * not change while the Host runs; every supported profile re-reads it on the
 * next start. The panel only needs the name: display text and desktop-only
 * caveats are the client's business, so the Host never learns UI vocabulary.
 */

/**
 * Read the launcher-owned profile name without requiring the service.
 * @param {object} ctx - Host plugin context.
 * @returns {{profile: string | null}} the running profile, or null when the
 *   Host was not started by the profile launcher.
 */
export function surfaceOf(ctx) {
  let name;
  try {
    name = ctx?.get?.('profileContext')?.name;
  } catch {
    // A foreign composition may answer with a throwing getter; an unknown
    // surface is still a working plugin, never a load failure.
    name = undefined;
  }
  return { profile: typeof name === 'string' && name !== '' ? name : null };
}
