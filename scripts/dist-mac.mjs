import { spawnFile } from './lib/spawn-file.mjs';
import path from 'node:path';
import { packageMac } from './lib/package-mac.mjs';

const root = process.cwd();
const { appPath } = await packageMac(root);

await spawnFile(process.execPath, [path.join(root, 'scripts', 'create-dmg.mjs'), appPath], {
  env: process.env
});
