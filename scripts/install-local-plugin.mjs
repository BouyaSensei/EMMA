#!/usr/bin/env node
/**
 * install-local-plugin.mjs — installe un plugin Emma dans le dépôt de plugins.
 *
 * Sources acceptées:
 *   1. Répertoire local contenant ghost.json
 *   2. Fichier .cindy (zip)
 *   3. URL directe https://…/<id>.cindy
 *   4. Catalogue: --catalog <plugin-id> (résolu via config/plugin-catalog.json,
 *      le dépôt git est cloné en cache locale puis packagé à la volée)
 *
 * 用法:
 *   node scripts/install-local-plugin.mjs <dir | .cindy | https://…> [--owner <id>] [--force]
 *   node scripts/install-local-plugin.mjs --catalog <plugin-id> [--owner <id>] [--force]
 *
 * 目标位置(与设置页/双击 .cindy 的安装结果同构):
 *   <userData>/owners/<ownerId>/cindy-brain/_ns/_root/<plugin-id>/
 *   Windows userData = %APPDATA%\EmmaGlobal (可用 EMMA_USER_DATA 覆盖)
 *
 * 说明:
 *   - plugin-id 取自包内 ghost.json 的 "id" 字段。
 *   - 已存在同 id 目录时默认拒绝,加 --force 覆盖(会先备份到 <dir>.bak-<ts>)。
 *   - 装完重启 Emma 即生效;插件列表在设置 → 插件 里查看。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const force = args.includes('--force');
const ownerIdx = args.indexOf('--owner');
const ownerIdArg = ownerIdx >= 0 ? args[ownerIdx + 1] : undefined;
const catalogIdx = args.indexOf('--catalog');
const catalogId = catalogIdx >= 0 ? args[catalogIdx + 1] : undefined;
const positional = args.filter(
  (a, i) => !a.startsWith('--') && a !== ownerIdArg && a !== catalogId,
);
const source = positional[0];
if (!source && !catalogId) {
  console.log(
    '用法: node scripts/install-local-plugin.mjs <dir | .cindy | https://…> [--owner <id>] [--force]\n' +
      '      node scripts/install-local-plugin.mjs --catalog <plugin-id> [--owner <id>] [--force]',
  );
  process.exit(1);
}

const REPO = fileURLToPath(new URL('..', import.meta.url));

// ---- Catalogue ---------------------------------------------------------------
function loadCatalog() {
  const p = path.join(REPO, 'config', 'plugin-catalog.json');
  if (!fs.existsSync(p)) fail(`catalogue introuvable: ${p}`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const CLONE_CACHE = path.join(os.tmpdir(), 'emma-plugin-repos');

function cloneRepo(repoUrl, cacheKey) {
  const dir = path.join(CLONE_CACHE, cacheKey);
  if (fs.existsSync(path.join(dir, '.git'))) {
    console.log(`• repo en cache: ${dir} — pull…`);
    try {
      execFileSync('git', ['-C', dir, 'pull', '--ff-only'], { stdio: 'inherit' });
    } catch {
      console.log('  (pull impossible, on utilise la version en cache)');
    }
    return dir;
  }
  fs.mkdirSync(CLONE_CACHE, { recursive: true });
  console.log(`• clone ${repoUrl} → ${dir}`);
  execFileSync('git', ['clone', '--depth', '1', repoUrl, dir], { stdio: 'inherit' });
  return dir;
}

function packageDirToCindy(pluginDir) {
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, 'ghost.json'), 'utf8'));
  const tmp = path.join(os.tmpdir(), `emma-pack-${manifest.id}-${Date.now()}`);
  // Staging: on exclut les artefacts .cindy existants (convention Forge: l'artefact
  // vit dans le répertoire source et ne doit pas se ré-emballer lui-même).
  const stage = path.join(tmp, 'stage');
  fs.cpSync(pluginDir, stage, { recursive: true, filter: (src) => !src.toLowerCase().endsWith('.cindy') });
  const cindyPath = path.join(tmp, `${manifest.id}.cindy`);
  if (process.platform === 'win32') {
    const zipCopy = path.join(tmp, 'package.zip');
    execFileSync(
      'powershell',
      ['-NoProfile', '-Command', `Compress-Archive -Path '${path.join(stage, '*')}' -DestinationPath '${zipCopy}' -Force`],
      { stdio: 'inherit' },
    );
    fs.renameSync(zipCopy, cindyPath);
  } else {
    execFileSync('zip', ['-qr', cindyPath, '.'], { cwd: stage, stdio: 'inherit' });
  }
  return cindyPath;
}

// ---- Résolution de la source → fichier .cindy ou répertoire ------------------
let resolvedSource = source;
if (catalogId) {
  const catalog = loadCatalog();
  const entry = catalog.plugins.find((p) => p.id === catalogId);
  if (!entry) fail(`plugin "${catalogId}" absent du catalogue (${catalog.plugins.length} disponibles — voir config/plugin-catalog.json)`);
  console.log(`• catalogue: ${entry.name} v${entry.version}`);
  const cacheKey = entry.repo.replace(/[^a-zA-Z0-9]/g, '_');
  const repoDir = cloneRepo(entry.repo, cacheKey);
  const pluginDir = path.join(repoDir, entry.path);
  if (!fs.existsSync(path.join(pluginDir, 'ghost.json'))) fail(`dépôt cloné mais pas de ghost.json dans ${entry.path}`);
  resolvedSource = packageDirToCindy(pluginDir);
}

if (resolvedSource && /^https?:\/\//.test(resolvedSource)) {
  const tmp = path.join(os.tmpdir(), `emma-dl-${Date.now()}`);
  fs.mkdirSync(tmp, { recursive: true });
  const dest = path.join(tmp, path.basename(new URL(resolvedSource).pathname) || 'plugin.cindy');
  console.log(`• téléchargement ${resolvedSource}`);
  try {
    execFileSync('curl', ['-fsSL', '-o', dest, resolvedSource], { stdio: 'inherit' });
  } catch {
    // Windows sans curl → PowerShell
    execFileSync(
      'powershell',
      ['-NoProfile', '-Command', `Invoke-WebRequest -Uri '${resolvedSource}' -OutFile '${dest}'`],
      { stdio: 'inherit' },
    );
  }
  resolvedSource = dest;
}

// ---- 定位 userData ----------------------------------------------------------
function defaultUserData() {
  if (process.platform === 'win32') return path.join(process.env.APPDATA ?? '', 'EmmaGlobal');
  if (process.platform === 'darwin')
    return path.join(os.homedir(), 'Library/Application Support/EmmaGlobal');
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config'), 'EmmaGlobal');
}
const userData = process.env.EMMA_USER_DATA ? path.resolve(process.env.EMMA_USER_DATA) : defaultUserData();
if (!fs.existsSync(userData)) fail(`找不到 Emma 数据目录: ${userData}(先启动过一次 Emma,或用 EMMA_USER_DATA 指定)`);

// ---- 选 owner 目录 ----------------------------------------------------------
const ownersDir = path.join(userData, 'owners');
function pickOwner() {
  if (ownerIdArg) {
    const p = path.join(ownersDir, ownerIdArg);
    if (!fs.existsSync(p)) fail(`owner 目录不存在: ${p}`);
    return ownerIdArg;
  }
  const entries = fs
    .readdirSync(ownersDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({ name: e.name, mtime: fs.statSync(path.join(ownersDir, e.name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!entries.length) fail(`${ownersDir} 下没有 owner 目录`);
  return entries[0].name;
}
const ownerId = pickOwner();
console.log(`• owner: ${ownerId}`);

// ---- 准备包内容(目录直拷 / .cindy 解压)------------------------------------
let packageDir;
if (fs.existsSync(resolvedSource) && fs.statSync(path.resolve(resolvedSource)).isFile()) {
  if (!resolvedSource.toLowerCase().endsWith('.cindy')) fail(`文件需以 .cindy 结尾: ${resolvedSource}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'emma-plugin-'));
  const extractDir = path.join(tmp, 'extract');
  fs.mkdirSync(extractDir, { recursive: true });
  console.log(`• 解压 ${path.basename(resolvedSource)} …`);
  try {
    if (process.platform === 'win32') {
      // Expand-Archive 只认 .zip 扩展名:先拷一份临时 .zip 再解压。
      const zipCopy = path.join(tmp, 'package.zip');
      fs.copyFileSync(resolvedSource, zipCopy);
      execFileSync(
        'powershell',
        ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zipCopy}' -DestinationPath '${extractDir}' -Force`],
        { stdio: 'inherit' },
      );
    } else {
      execFileSync('unzip', ['-q', resolvedSource, '-d', extractDir], { stdio: 'inherit' });
    }
  } catch (err) {
    fail(`解压失败: ${err.message}`);
  }
  // zip 内可能多套一层目录,下钻到 ghost.json 所在层
  let dir = extractDir;
  for (let i = 0; i < 3 && !fs.existsSync(path.join(dir, 'ghost.json')); i++) {
    const sub = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
    if (sub.length === 1) dir = path.join(dir, sub[0].name);
    else break;
  }
  packageDir = dir;
} else {
  packageDir = path.resolve(resolvedSource);
}

const manifestPath = path.join(packageDir, 'ghost.json');
if (!fs.existsSync(manifestPath)) fail(`包内找不到 ghost.json: ${packageDir}`);
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (err) {
  fail(`ghost.json 解析失败: ${err.message}`);
}
if (!manifest.id) fail('ghost.json 缺少 "id" 字段');
console.log(`• 插件: ${manifest.id} v${manifest.version ?? '?'}`);

// ---- 落盘 -------------------------------------------------------------------
const targetDir = path.join(userData, 'owners', ownerId, 'cindy-brain', '_ns', '_root', manifest.id);
if (fs.existsSync(targetDir)) {
  if (!force) fail(`已存在 ${targetDir}(加 --force 覆盖)`);
  const backup = `${targetDir}.bak-${Date.now()}`;
  fs.renameSync(targetDir, backup);
  console.log(`• 旧版本备份到 ${path.basename(backup)}`);
}
fs.mkdirSync(path.dirname(targetDir), { recursive: true });
fs.cpSync(packageDir, targetDir, { recursive: true });
console.log(`✓ 已安装到 ${targetDir}`);
console.log('  重启 Emma 后生效;设置 → 插件 里查看/启用。');
