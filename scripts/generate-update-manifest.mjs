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
 *
 * Optional: --agent-binaries <dir> — a staged agent-binary tree (see
 * scripts/stage-agent-binaries.mjs). When given, the manifest gains the vendor
 * fields the startup env check requires (claudeCode / codexPackage / ripgrep,
 * plus optional pi) with sha256/size of the release assets and binarySha256 of
 * the raw binaries where applicable.
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

// Vendor binary assets: flat release-asset names staged by
// scripts/stage-agent-binaries.mjs as <prefix>-<version>-<platformKey>.<ext>.
// `file` in the manifest is relative to cdnBaseUrl, i.e. the asset name itself.
function vendorAsset(stagedFile, rawBinary) {
  const abs = path.resolve(stagedFile);
  const buf = fs.readFileSync(abs);
  // Version is embedded in the flat name: <prefix>-<version>-<platformKey>.<ext>
  const base = path.basename(abs);
  const m = base.match(/^(?:claude-code|codex-package|ripgrep|pi)-(.+)-(?:win32-x64|win32-arm64|darwin-arm64|darwin-x64|linux-x64|linux-arm64)\.(?:tar\.)?gz$/);
  const asset = {
    version: m ? m[1] : null,
    file: base,
    sha256: createHash('sha256').update(buf).digest('hex'),
    size: buf.length,
  };
  if (rawBinary && fs.existsSync(rawBinary)) {
    asset.binarySha256 = createHash('sha256')
      .update(fs.readFileSync(rawBinary))
      .digest('hex');
  }
  return asset;
}

const manifest = { app };
if (args['agent-binaries']) {
  const stageRoot = path.resolve(args['agent-binaries']);
  const platformKey = args.platform;
  if (!fs.existsSync(stageRoot)) {
    console.error(`agent-binaries dir not found: ${stageRoot}`);
    process.exit(1);
  }
  const findStaged = (prefix) =>
    fs
      .readdirSync(stageRoot)
      .find((f) => f.startsWith(`${prefix}-`) && f.includes(`-${platformKey}.`));

  // Optional sidecar written by stage-agent-binaries.mjs with raw-binary hashes.
  const summaryPath = path.join(stageRoot, `.staged-${platformKey}.json`);
  const summaryAssets = fs.existsSync(summaryPath)
    ? Object.fromEntries(
        JSON.parse(fs.readFileSync(summaryPath, 'utf8'))
          .assets.map((a) => [a.file, a.binarySha256]),
      )
    : {};

  const claudeGz = findStaged('claude-code');
  if (claudeGz) {
    manifest.claudeCode = vendorAsset(path.join(stageRoot, claudeGz), null);
    if (summaryAssets[claudeGz]) manifest.claudeCode.binarySha256 = summaryAssets[claudeGz];
  }
  const codexTgz = findStaged('codex-package');
  if (codexTgz) {
    manifest.codexPackage = vendorAsset(path.join(stageRoot, codexTgz), null);
  }
  const rgGz = findStaged('ripgrep');
  if (rgGz) {
    manifest.ripgrep = vendorAsset(path.join(stageRoot, rgGz), null);
    if (summaryAssets[rgGz]) manifest.ripgrep.binarySha256 = summaryAssets[rgGz];
  }
  // pi is optional: its absence must not fail the manifest.
  const piTgz = findStaged('pi');
  if (piTgz) manifest.pi = vendorAsset(path.join(stageRoot, piTgz), null);

  for (const field of ['claudeCode', 'codexPackage', 'ripgrep']) {
    if (!manifest[field]) {
      console.error(`missing staged asset for ${field} (${platformKey}) under ${stageRoot}`);
      process.exit(1);
    }
  }
}

fs.writeFileSync(args.out, JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${args.out} (app.version=${args.version}, installer=${app.installer.file}, sha256=${app.installer.sha256}${args['agent-binaries'] ? ', vendors=' + Object.keys(manifest).filter((k) => k !== 'app').join(',') : ''})`);
