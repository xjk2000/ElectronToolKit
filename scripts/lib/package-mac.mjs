import { packager } from '@electron/packager';
import { readFile, rename, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { spawnFile } from './spawn-file.mjs';

const require = createRequire(import.meta.url);
const { APP_META } = require('../../src/app-meta.cjs');

export async function packageMac(root = process.cwd()) {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const arch = process.env.MAC_ARCH || 'arm64';
  const identity = process.env.MAC_SIGN_IDENTITY || process.env.CODESIGN_IDENTITY;
  const appBundleId = process.env.MAC_APP_BUNDLE_ID || APP_META.bundleId;
  const releaseDir = path.join(root, 'release');
  const versionedDirName = `${APP_META.displayName}-${pkg.version}-darwin-${arch}`;
  const versionedDirPath = path.join(releaseDir, versionedDirName);

  process.env.ELECTRON_MIRROR ??= 'https://npmmirror.com/mirrors/electron/';

  const options = {
    dir: root,
    name: APP_META.displayName,
    platform: 'darwin',
    arch,
    out: releaseDir,
    overwrite: true,
    asar: false,
    appBundleId,
    appCategoryType: 'public.app-category.developer-tools',
    executableName: APP_META.displayName,
    icon: path.join(root, 'build', 'icon.icns')
  };

  if (identity) {
    options.osxSign = {
      identity,
      hardenedRuntime: true,
      entitlements: path.join(root, 'build', 'entitlements.mac.plist'),
      entitlementsInherit: path.join(root, 'build', 'entitlements.mac.plist'),
      gatekeeperAssess: false,
      continueOnError: false
    };
  }

  const appPaths = await packager(options);
  const packedDirPath = appPaths[0];
  await rm(versionedDirPath, { force: true, recursive: true });
  if (path.resolve(packedDirPath) !== path.resolve(versionedDirPath)) {
    await rename(packedDirPath, versionedDirPath);
  }

  const appPath = path.join(versionedDirPath, `${APP_META.displayName}.app`);

  if (!identity) {
    await spawnFile('codesign', [
      '--force',
      '--deep',
      '--sign',
      '-',
      '--options',
      'runtime',
      '--entitlements',
      path.join(root, 'build', 'entitlements.mac.plist'),
      appPath
    ]);
  }

  return {
    appPath,
    arch,
    releaseDir,
    version: pkg.version,
    versionedDirName,
    versionedDirPath
  };
}
