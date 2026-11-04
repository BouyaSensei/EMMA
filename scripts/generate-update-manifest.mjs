#!/usr/bin/env node
/**
 * generate-update-manifest.mjs — build an Emma auto-update manifest for one platform.
 *
 * The desktop updater (apps/desktop/src/main/manifestService.ts) fetches:
 *   {cdnBaseUrl}/manifest-{platform}-{arch}.json
 * where cdnBaseUrl is the GitHub Releases "latest/download" base URL
 * (config/endpoint.global.json). Asset `file` values are relative to that
 * base, i.e. plain release-asset names.
 *
 * Usage:
 *   node scripts/generate-update-manifest.mjs \
 *     --version 0.1.0 \
 *     --platform win32-x64 \
 *     --installer "emma-setup-0.1.0.exe" \
 *     --out manifest-win32-x64.json
 *
 * Optional: --hotfix <file.zip> for the hotfix ZIP channel.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    args[key] = argv[i + 1];
    i += 1;
  }
  return args;
}

function assetFor(file) {
  const abs = path.resolve(file);
  const buf = fs.readFileSync(abs);
  return {
    file: path.basename(abs),
    sha256: createHash('sha256').update(buf).digest('hex'),
    size: buf.length,
  };
}

const args = parseArgs(process.argv.slice(2));
const required = ['version', 'platform', 'installer', 'out'];
for (const key of required) {
  if (!args[key]) {
    console.error(`missing --${key}`);
    process.exit(1);
  }
}

const app = { version: args.version };
if (args.releaseNotes) app.releaseNotes = args.releaseNotes;
app.installer = assetFor(args.installer);
if (args.hotfix) app.hotfix = assetFor(args.hotfix);

const manifest = { app };
fs.writeFileSync(args.out, JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${args.out} (app.version=${args.version}, installer=${app.installer.file}, sha256=${app.installer.sha256})`);
