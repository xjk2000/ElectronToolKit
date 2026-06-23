import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

const root = process.cwd();
const buildDir = path.join(root, 'build');
const iconsetDir = path.join(buildDir, 'icon.iconset');

const appIconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="170" y1="78" x2="850" y2="940" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#5ba1ff"/>
      <stop offset="0.48" stop-color="#2666e8"/>
      <stop offset="1" stop-color="#1c2b9e"/>
    </linearGradient>
    <linearGradient id="toolbox" x1="235" y1="504" x2="790" y2="804" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#f59a2d"/>
      <stop offset="0.58" stop-color="#d86b1c"/>
      <stop offset="1" stop-color="#a94316"/>
    </linearGradient>
    <linearGradient id="metal" x1="260" y1="220" x2="760" y2="695" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#f9fbff"/>
      <stop offset="0.48" stop-color="#cfd9e5"/>
      <stop offset="1" stop-color="#8797a9"/>
    </linearGradient>
    <linearGradient id="handle" x1="331" y1="564" x2="381" y2="767" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#f3a34a"/>
      <stop offset="1" stop-color="#9a4e1f"/>
    </linearGradient>
    <filter id="iconShadow" x="-18%" y="-18%" width="136%" height="136%">
      <feDropShadow dx="0" dy="26" stdDeviation="30" flood-color="#06184c" flood-opacity="0.42"/>
    </filter>
    <filter id="toolShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="14" stdDeviation="12" flood-color="#08214f" flood-opacity="0.35"/>
    </filter>
  </defs>
  <rect x="70" y="70" width="884" height="884" rx="210" fill="url(#bg)"/>
  <path d="M130 263C179 145 279 102 415 102h238c144 0 245 59 286 184C821 246 707 229 585 234 409 241 267 302 160 417c-23-42-32-91-30-154Z" fill="#ffffff" opacity="0.12"/>
  <g filter="url(#iconShadow)">
    <g transform="rotate(-9 495 394)">
      <rect x="243" y="258" width="468" height="306" rx="45" fill="#21334b" stroke="#2b405d" stroke-width="22"/>
      <rect x="285" y="305" width="384" height="212" rx="22" fill="#142236"/>
      <path d="M307 478h302M319 425h184M355 375h258" stroke="#426481" stroke-width="22" stroke-linecap="round" opacity="0.65"/>
      <path d="M410 252c6-35 31-55 70-62l70-13c39-7 70 2 91 31" fill="none" stroke="#2b405d" stroke-width="22" stroke-linecap="round"/>
    </g>

    <g filter="url(#toolShadow)">
      <path d="M352 732 314 575" stroke="#26364e" stroke-width="72" stroke-linecap="round"/>
      <path d="M352 732 314 575" stroke="url(#handle)" stroke-width="48" stroke-linecap="round"/>
      <path d="M254 389c80-76 178-52 245 37l-69 46c-48-50-92-57-138-11l-47-11-34-37Z" fill="url(#metal)" stroke="#26364e" stroke-width="22" stroke-linejoin="round"/>
      <path d="M224 433c-16-18-14-45 4-61l28-25c18-16 45-14 61 4l32 36-93 83-32-37Z" fill="url(#metal)" stroke="#26364e" stroke-width="22"/>

      <path d="M582 701 709 246" stroke="#26364e" stroke-width="70" stroke-linecap="round"/>
      <path d="M582 701 709 246" stroke="#e7eef7" stroke-width="42" stroke-linecap="round"/>
      <path d="m673 230 43-34 50 14 15 51-43 34-23-59-42-6Z" fill="url(#metal)" stroke="#26364e" stroke-width="22" stroke-linejoin="round"/>

      <path d="M504 676 496 423" stroke="#26364e" stroke-width="78" stroke-linecap="round"/>
      <path d="M504 676 496 423" stroke="url(#metal)" stroke-width="48" stroke-linecap="round"/>
      <path d="M460 275a112 112 0 0 0 120 164l-44-77 35-77 88 29a112 112 0 0 0-199-39Z" fill="url(#metal)" stroke="#26364e" stroke-width="22" stroke-linejoin="round"/>

      <path d="M675 707 818 421" stroke="#26364e" stroke-width="64" stroke-linecap="round"/>
      <path d="M675 707 818 421" stroke="#f4f7fb" stroke-width="34" stroke-linecap="round"/>
      <path d="m811 372 40-63 35 19-25 70-37 47-48-25 35-48Z" fill="#f4f7fb" stroke="#26364e" stroke-width="20" stroke-linejoin="round"/>
    </g>

    <g>
      <path d="M235 516h554c30 0 54 24 54 54v216c0 30-24 54-54 54H235c-30 0-54-24-54-54V570c0-30 24-54 54-54Z" fill="#26364e"/>
      <path d="M222 552h580v238c0 14-11 25-25 25H247c-14 0-25-11-25-25V552Z" fill="url(#toolbox)"/>
      <path d="M222 552h580v72H222z" fill="#f1a23d"/>
      <path d="M222 641h580" stroke="#5b2e20" stroke-width="16" opacity="0.45"/>
      <path d="M274 552v263M750 552v263" stroke="#2c3c51" stroke-width="26"/>
      <path d="M206 553h612" stroke="#dce7f2" stroke-width="28" stroke-linecap="round"/>
      <rect x="641" y="598" width="92" height="115" rx="18" fill="#2b4058" stroke="#172436" stroke-width="16"/>
      <rect x="671" y="635" width="32" height="44" rx="9" fill="#f5f8fc"/>
      <circle cx="274" cy="782" r="16" fill="#8393a6"/>
      <circle cx="750" cy="782" r="16" fill="#8393a6"/>
      <path d="M250 596h350" stroke="#ffffff" stroke-width="14" stroke-linecap="round" opacity="0.32"/>
    </g>
  </g>
</svg>`;

const traySvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <path d="M21 23h22c3 0 5 2 5 5v4H16v-4c0-3 2-5 5-5Z" fill="none" stroke="#000" stroke-width="5" stroke-linejoin="round"/>
  <path d="M16 32h32v17c0 3-2 5-5 5H21c-3 0-5-2-5-5V32Z" fill="none" stroke="#000" stroke-width="5" stroke-linejoin="round"/>
  <path d="M25 23c0-5 3-8 7-8s7 3 7 8" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round"/>
  <path d="M22 39h20" stroke="#000" stroke-width="5" stroke-linecap="round"/>
  <path d="M31 49v-9" stroke="#000" stroke-width="5" stroke-linecap="round"/>
  <path d="M23 13 34 24M41 13 31 24" stroke="#000" stroke-width="5" stroke-linecap="round"/>
</svg>`;

await mkdir(buildDir, { recursive: true });
await rm(iconsetDir, { recursive: true, force: true });
await mkdir(iconsetDir, { recursive: true });

await sharp(Buffer.from(appIconSvg)).resize(1024, 1024).png().toFile(path.join(buildDir, 'icon.png'));

const iconSizes = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024]
];

await Promise.all(
  iconSizes.map(([fileName, size]) =>
    sharp(Buffer.from(appIconSvg)).resize(size, size).png().toFile(path.join(iconsetDir, fileName))
  )
);

await sharp(Buffer.from(traySvg)).resize(18, 18).png().toFile(path.join(buildDir, 'trayTemplate.png'));
await sharp(Buffer.from(traySvg)).resize(36, 36).png().toFile(path.join(buildDir, 'trayTemplate@2x.png'));

await run('iconutil', ['-c', 'icns', iconsetDir, '-o', path.join(buildDir, 'icon.icns')]);
await rm(iconsetDir, { recursive: true, force: true });

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}
