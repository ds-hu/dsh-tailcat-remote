import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const profileDir = path.join(os.homedir(), '.dsh', 'profiles', process.env.DSH_PROFILE ?? 'web');
const packagePath = path.join(profileDir, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

packageJson.dsh ??= {};
packageJson.dsh.profile ??= {};
const bundles = packageJson.dsh.profile.bundles ?? [];
if (!bundles.includes('@ds-hu/dsh-tailcat-remote')) bundles.push('@ds-hu/dsh-tailcat-remote');
packageJson.dsh.profile.bundles = bundles;
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

console.log(`profile ${profileDir} prepared`);
