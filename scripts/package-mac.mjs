import path from 'node:path';
import { packageMac } from './lib/package-mac.mjs';

const root = process.cwd();
const result = await packageMac(root);

console.log(`App bundle written to: ${path.relative(root, result.versionedDirPath)}`);
