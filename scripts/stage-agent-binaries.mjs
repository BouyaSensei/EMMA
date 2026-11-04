#!/usr/bin/env node
/**
 * stage-agent-binaries.mjs — package the pinned agent binaries for ONE platform
 * into flat release-asset files, ready to be uploaded as GitHub Release assets.
 *
 * The desktop app (apps/desktop/src/main/agent-binaries/factory.ts) downloads:
 *   {cdnBaseUrl}/{asset.file}
 * where asset.file is a plain release-asset name. We use the flat convention:
 *   claude-code-<version>-<platformKey>.gz          (gz of the raw binary)
 *   codex-package-<version>-<platformKey>.tar.gz    (archive root = runtime dir)
 *   ripgrep-<version>-<platformKey>.gz              (gz of the raw binary)
 *   pi-<version>-<platformKey>.tar.gz               (archive root = runtime dir)
 *
 * Inputs (run the matching tools/<tool>/update.mjs first to populate these):
 *   tools/claude/updates/<v>/<pk>/claude[.exe]
 *   tools/codex-package/updates/<v>/<pk>/            (full runtime directory)
 *   tools/ripgrep/updates/<v>/<pk>/rg[.exe]
 *   pi: downloaded from the pinned URL in tools/pi/latest.json (zip on win32,
 *       tar.gz elsewhere) and repacked as tar.gz so the runtime extractor works.
 *
 * Usage:
 *   node scripts/stage-agent-binaries.mjs --platform win32-x64 --out dist-agent-binaries
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import * as tar from 'tar';
import unzipper from 'unzipper';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    args[a.slice(2)] = argv[i + 1];
    i += 1;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.platform || !args.out) {
  console.error('usage: node scripts/stage-agent-binaries.mjs --platform <pk> --out <dir>');
  process.exit(1);
}
const pk = args.platform;
const outRoot = path.resolve(args.out);
fs.mkdirSync(outRoot, { recursive: true });

function readPin(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

function sha256File(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function log(line) {
  console.log(`[stage-agent-binaries] ${line}`);
}

// gzip a file to dest (streaming, no temp next to source)
async function gzipFile(src, dest) {
  await pipeline(
    fs.createReadStream(src),
    createGzip(),
    fs.createWriteStream(dest),
  );
}

async function tarGzDir(dir, dest) {
  // Archive root = the directory CONTENTS (runtime dir at archive root).
  // Exclude tools-side cache dotfiles (.manifest, .asset-digest.bin, ...).
  //
  // Use the npm `tar` package (already a workspace dep) instead of shelling out
  // to a system tar binary. The shell form was not portable:
  //   - GNU tar matches `--exclude=.*` against the root operand `.` and silently
  //     emits an EMPTY archive (reproduced on win32 Git-Bash GNU tar 1.35 — a
  //     45-byte codex package that then fails the startup env check);
  //   - bsdtar (Windows System32) chokes on `-C E:\...` drive-letter paths.
  // Passing the explicit top-level non-dot entries keeps the archive root =
  // runtime dir and is identical across GNU tar / bsdtar / Node on all three
  // release platforms.
  const entries = fs.readdirSync(dir).filter((n) => !n.startsWith('.'));
  if (entries.length === 0) {
    throw new Error(`tarGzDir: no archivable entries in ${dir}`);
  }
  await tar.c({ cwd: dir, gzip: true, file: dest }, entries);
}

const staged = [];
function record(dest, rawBinary) {
  const size = fs.statSync(dest).size;
  const entry = { file: path.basename(dest), size };
  if (rawBinary && fs.existsSync(rawBinary)) {
    entry.binarySha256 = createHash('sha256')
      .update(fs.readFileSync(rawBinary))
      .digest('hex');
  }
  staged.push(entry);
  log(`${entry.file} (${(size / 1e6).toFixed(1)} MB)`);
}

// ── claude-code (single binary, gz) ────────────────────────────────────────
{
  const pin = readPin('tools/claude/latest.json');
  const v = pin.version;
  if (!v) throw new Error('tools/claude/latest.json has no version');
  const binName = pk.startsWith('win32') ? 'claude.exe' : 'claude';
  const src = path.join(ROOT, 'tools/claude/updates', v, pk, binName);
  if (!fs.existsSync(src)) {
    throw new Error(`missing ${src} — run: node tools/claude/update.mjs ${v}`);
  }
  const dest = path.join(outRoot, `claude-code-${v}-${pk}.gz`);
  await gzipFile(src, dest);
  record(dest, src);
}

// ── codex-package (full runtime dir, tar.gz) ───────────────────────────────
{
  const pin = readPin('tools/codex-package/latest.json');
  const v = pin.version;
  if (!v) throw new Error('tools/codex-package/latest.json has no version');
  const dir = path.join(ROOT, 'tools/codex-package/updates', v, pk);
  const mainBin = path.join(dir, 'bin', pk.startsWith('win32') ? 'codex.exe' : 'codex');
  if (!fs.existsSync(mainBin)) {
    throw new Error(`missing ${mainBin} — run: node tools/codex-package/update.mjs ${v}`);
  }
  const dest = path.join(outRoot, `codex-package-${v}-${pk}.tar.gz`);
  await tarGzDir(dir, dest);
  record(dest);
}

// ── ripgrep (single binary, gz) ────────────────────────────────────────────
{
  const pin = readPin('tools/ripgrep/latest.json');
  const v = pin.version;
  if (!v) throw new Error('tools/ripgrep/latest.json has no version');
  const binName = pk.startsWith('win32') ? 'rg.exe' : 'rg';
  const src = path.join(ROOT, 'tools/ripgrep/updates', v, pk, binName);
  if (!fs.existsSync(src)) {
    throw new Error(`missing ${src} — run: node tools/ripgrep/update.mjs ${v}`);
  }
  const dest = path.join(outRoot, `ripgrep-${v}-${pk}.gz`);
  await gzipFile(src, dest);
  record(dest, src);
}

// ── pi (full runtime dir, tar.gz; repack upstream zip on win32) ────────────
{
  const pin = readPin('tools/pi/latest.json');
  const v = pin.version;
  const asset = pin.runtimeAssets?.[pk];
  if (!v || !asset?.url) {
    log(`pi: no pinned runtime asset for ${pk} — skipping (optional vendor)`);
  } else {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emma-pi-'));
    try {
      const rawName = asset.url.split('/').pop();
      const rawPath = path.join(tmpDir, rawName);
      log(`pi ${v} ${pk}: downloading ${asset.url}`);
      execFileSync('curl', ['-fsSL', '--retry', '3', '-o', rawPath, asset.url], { stdio: 'inherit' });
      if (asset.sha256) {
        const actual = sha256File(rawPath);
        if (actual.toLowerCase() !== String(asset.sha256).toLowerCase()) {
          throw new Error(`pi ${pk} sha256 mismatch: ${actual} != ${asset.sha256}`);
        }
      }
      const dest = path.join(outRoot, `pi-${v}-${pk}.tar.gz`);
      if (rawName.endsWith('.tar.gz')) {
        fs.copyFileSync(rawPath, dest);
      } else if (rawName.endsWith('.zip')) {
        const extractDir = path.join(tmpDir, 'extracted');
        fs.mkdirSync(extractDir, { recursive: true });
        // Portable zip extraction (system `tar -xf` reads zip only on bsdtar and
        // chokes on Windows drive-letter `-C` paths). unzipper is pure JS and its
        // promise settles reliably across Node versions / platforms (extract-zip
        // v2 left a top-level await unsettled under Node 26).
        await new Promise((resolve, reject) => {
          fs.createReadStream(rawPath)
            .pipe(unzipper.Extract({ path: extractDir }))
            .on('close', resolve)
            .on('error', reject);
        });
        // Tolerate an upstream wrapper dir (single top-level directory).
        let rootDir = extractDir;
        const entries = fs.readdirSync(extractDir).filter((n) => !n.startsWith('.'));
        if (entries.length === 1 && fs.statSync(path.join(extractDir, entries[0])).isDirectory()) {
          rootDir = path.join(extractDir, entries[0]);
        }
        const binName = pk.startsWith('win32') ? 'pi.exe' : 'pi';
        if (!fs.existsSync(path.join(rootDir, binName))) {
          throw new Error(`pi archive missing main executable ${binName} at root`);
        }
        await tarGzDir(rootDir, dest);
      } else {
        throw new Error(`unsupported pi asset format: ${rawName}`);
      }
      record(dest);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}

// Machine-readable summary for the manifest generator / CI logs.
const summary = path.join(outRoot, `.staged-${pk}.json`);
fs.writeFileSync(summary, JSON.stringify({ platform: pk, assets: staged }, null, 2) + '\n');
log(`staged ${staged.length} agent-binary asset(s) for ${pk}`);
