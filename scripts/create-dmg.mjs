import { spawnFile } from './lib/spawn-file.mjs';
import { mkdir, readFile, rm, stat, symlink } from 'node:fs/promises';
import path from 'node:path';

const appPath = process.argv[2];

if (!appPath) {
  console.error('Usage: node scripts/create-dmg.mjs <path-to-app>');
  process.exit(1);
}

const root = process.cwd();
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const appName = path.basename(appPath, '.app');
const archMatch = appPath.match(/darwin-([^/]+)/);
const arch = archMatch?.[1] ?? process.env.MAC_ARCH ?? 'arm64';
const releaseDir = path.join(root, 'release');
const stagingDir = path.join(releaseDir, `dmg-staging-${pkg.version}-${arch}`);
const dmgPath = path.join(releaseDir, `${appName}-${pkg.version}-mac-${arch}.dmg`);
const identity = process.env.MAC_SIGN_IDENTITY || process.env.CODESIGN_IDENTITY;
const appleId = process.env.APPLE_ID;
const applePassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
const teamId = process.env.APPLE_TEAM_ID;

if (!appPath.endsWith('.app')) {
  throw new Error(`Expected a .app bundle path, received: ${appPath}`);
}

const appStat = await stat(appPath);
if (!appStat.isDirectory()) {
  throw new Error(`App bundle not found: ${appPath}`);
}

await rm(stagingDir, { force: true, recursive: true });
await mkdir(stagingDir, { recursive: true });

await spawnFile('ditto', [appPath, path.join(stagingDir, `${appName}.app`)]);
await symlink('/Applications', path.join(stagingDir, 'Applications'));

await rm(dmgPath, { force: true });
await spawnFile('hdiutil', ['create', '-volname', appName, '-srcfolder', stagingDir, '-ov', '-format', 'UDZO', dmgPath]);

if (identity) {
  await spawnFile('codesign', ['--force', '--timestamp', '--sign', identity, dmgPath]);
}

if (identity && appleId && applePassword && teamId) {
  await spawnFile('xcrun', [
    'notarytool',
    'submit',
    dmgPath,
    '--apple-id',
    appleId,
    '--password',
    applePassword,
    '--team-id',
    teamId,
    '--wait'
  ]);
  await spawnFile('xcrun', ['stapler', 'staple', dmgPath]);
}

await rm(stagingDir, { force: true, recursive: true });
console.log(`DMG written to: ${path.relative(root, dmgPath)}`);
