#!/usr/bin/env node
/**
 * package-plugin.mjs — valide un plugin Emma (ghost.json) et produit le paquet
 * `.cindy` dans le répertoire source, comme le fait `ghost_forge_pack` dans l'app.
 *
 * 用法:
 *   node scripts/package-plugin.mjs <plugin-dir> [--out <dir>]
 *
 * 校验内容(与宿主 GhostManager 的最低契约一致):
 *   - ghost.json 存在且可解析
 *   - schemaVersion 为整数 (≥1)
 *   - id: 非空, [a-z0-9-] (小写、数字、连字符), ≤64 字符
 *   - version: semver-like (x.y.z)
 *   - entry 声明时文件必须存在; tools/mcpApps/node/panel 等引用文件同样检查
 *   - icon 声明时文件必须存在
 *
 * 产物: <plugin-dir>/<id>-<version>.cindy (同版本覆盖)。
 * zip 内 ghost.json 位于根部(与 Forge / 双击安装约定一致)。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDirArg = outIdx >= 0 ? args[outIdx + 1] : undefined;
const sourceDir = args.find((a) => !a.startsWith('--') && a !== outDirArg);
if (!sourceDir) {
  console.log('用法: node scripts/package-plugin.mjs <plugin-dir> [--out <dir>]');
  process.exit(1);
}

// ---- 校验 manifest ----------------------------------------------------------
const dir = path.resolve(sourceDir);
const manifestPath = path.join(dir, 'ghost.json');
if (!fs.existsSync(manifestPath)) fail(`找不到 ghost.json: ${manifestPath}`);

let m;
try {
  m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (err) {
  fail(`ghost.json 解析失败: ${err.message}`);
}

const errors = [];
if (!Number.isInteger(m.schemaVersion) || m.schemaVersion < 1)
  errors.push('schemaVersion 必须是 ≥1 的整数');
if (typeof m.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(m.id))
  errors.push('id 必须匹配 [a-z0-9][a-z0-9-]* (≤64 字符)');
if (typeof m.version !== 'string' || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(m.version))
  errors.push(`version 必须是 semver-like: "${m.version}"`);
if (!m.name) errors.push('缺少 name');

// 引用文件存在性检查
function checkRef(ref, label) {
  if (typeof ref !== 'string' || !ref) return;
  const p = path.join(dir, ref);
  if (!fs.existsSync(p)) errors.push(`${label} 引用的文件不存在: ${ref}`);
}
checkRef(m.entry, 'entry');
checkRef(m.icon, 'icon');
if (m.node && typeof m.node === 'object') checkRef(m.node.entry, 'node.entry');
if (Array.isArray(m.tools)) {
  for (const t of m.tools) {
    if (!t.name) errors.push('tools[] 有元素缺少 name');
  }
}

if (errors.length) {
  console.error(`✗ ${m.id ?? '(sans id)'} v${m.version ?? '?'} — ${errors.length} erreur(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`• ${m.id} v${m.version} — manifeste OK`);

// ---- 打包 -------------------------------------------------------------------
const outDir = outDirArg ? path.resolve(outDirArg) : dir;
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${m.id}-${m.version}.cindy`);

// Staging: on exclut les artefacts .cindy existants (l'artefact ne doit pas se
// ré-emballer lui-même) et les répertoires de travail cachés.
const stage = path.join(os.tmpdir(), `emma-stage-${m.id}-${Date.now()}`);
fs.cpSync(dir, stage, {
  recursive: true,
  filter: (src) => !src.toLowerCase().endsWith('.cindy'),
});

if (process.platform === 'win32') {
  // PowerShell Compress-Archive 只认 .zip:先打临时 zip. Le rename peut échouer
  // cross-device (tmp sur C:, source sur E:) → on copie puis on supprime.
  const tmpZip = path.join(path.dirname(stage), `${path.basename(outFile)}.tmp.zip`);
  if (fs.existsSync(tmpZip)) fs.unlinkSync(tmpZip);
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${path.join(stage, '*')}' -DestinationPath '${tmpZip}' -Force`,
    ],
    { stdio: 'inherit' },
  );
  fs.copyFileSync(tmpZip, outFile);
  fs.unlinkSync(tmpZip);
} else {
  execFileSync('zip', ['-qr', outFile, '.'], { cwd: stage, stdio: 'inherit' });
}
fs.rmSync(stage, { recursive: true, force: true });

const size = (fs.statSync(outFile).size / 1024).toFixed(1);
console.log(`✓ ${outFile} (${size} KB)`);
console.log('  Installation: node scripts/install-local-plugin.mjs <ce fichier> --force');
