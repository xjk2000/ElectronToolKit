import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnFile } from './lib/spawn-file.mjs';

const require = createRequire(import.meta.url);
const { APP_META } = require('../src/app-meta.cjs');
const root = process.cwd();
const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const arch = process.env.MAC_ARCH || 'arm64';
const appPath = path.join(root, 'release', `${APP_META.displayName}-${pkg.version}-darwin-${arch}`, `${APP_META.displayName}.app`);

await spawnFile(process.execPath, [path.join(root, 'scripts', 'create-dmg.mjs'), appPath], {
  env: process.env
});
