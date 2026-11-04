#!/usr/bin/env node
/**
 * import-agent-skills.mjs — importe les skills des autres agents dans le
 * répertoire shared d'Emma (`~/.agents/skills/`), avec ciblage par teammate.
 *
 * Sources scannées (défaut):
 *   ~/.claude/skills/    (Claude Code)
 *   ~/.codex/skills/     (Codex)
 * + tout répertoire passé en argument (skills de projet, archives…).
 *
 * 用法:
 *   node scripts/import-agent-skills.mjs                      # scan des sources par défaut
 *   node scripts/import-agent-skills.mjs <dir> [dir2 …]       # + répertoires explicites
 *   node scripts/import-agent-skills.mjs --list               # liste sans importer
 *   node scripts/import-agent-skills.mjs --force              # remplace les skills existants
 *   node scripts/import-agent-skills.mjs --scope "Bot A,Bot B"  # ciblage (défaut: all)
 *
 * Règles:
 *   - Un skill = un dossier contenant SKILL.md (frontmatter name+description).
 *   - Copie (pas de lien) vers ~/.agents/skills/<name>/ — Emma en devient propriétaire.
 *   - Conflit de nom → sauté sauf --force.
 *   - Le ciblage est enregistré dans ~/.agents/teammate-scopes.json :
 *     "all" = tous les teammates, liste = seulement ces bots (par nom ou id).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const home = os.homedir();
const SHARED_SKILLS = path.join(home, '.agents', 'skills');
const SCOPE_FILE = path.join(home, '.agents', 'teammate-scopes.json');
const DEFAULT_SOURCES = [path.join(home, '.claude', 'skills'), path.join(home, '.codex', 'skills')];

// ---- args -------------------------------------------------------------------
const args = process.argv.slice(2);
const listOnly = args.includes('--list');
const force = args.includes('--force');
const scopeIdx = args.indexOf('--scope');
const scopeArg = scopeIdx >= 0 ? args[scopeIdx + 1] : 'all';
const extraDirs = args.filter((a) => !a.startsWith('--') && a !== scopeArg);

if (!scopeArg) fail('--scope sans valeur (ex: --scope "Bot A,Bot B" ou --scope all)');
const audience = scopeArg === 'all' ? 'all' : scopeArg.split(',').map((s) => s.trim()).filter(Boolean);
if (!audience.length) fail('liste de ciblage vide');

// ---- frontmatter minimal (name + description) --------------------------------
function parseFrontmatter(content) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!m) return null;
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data[kv[1]] = value;
  }
  return data;
}

// ---- découverte ---------------------------------------------------------------
function discoverSkills(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    const skillFile = ['SKILL.md', 'skill.md']
      .map((n) => path.join(dir, n))
      .find((p) => fs.existsSync(p));
    if (!skillFile) continue;
    let data = null;
    try {
      data = parseFrontmatter(fs.readFileSync(skillFile, 'utf8'));
    } catch {
      // ignoré
    }
    out.push({
      name: data?.name?.trim() || entry.name,
      description: data?.description?.trim() ?? '',
      dir,
      valid: !!data && typeof data.name === 'string' && data.name.trim().length > 0,
    });
  }
  return out;
}

const sources = [...DEFAULT_SOURCES, ...extraDirs.map((d) => path.resolve(d))];
const found = [];
for (const source of sources) {
  const skills = discoverSkills(source);
  for (const skill of skills) found.push({ ...skill, source });
}

if (!found.length) {
  console.log('Aucun skill trouvé dans:');
  for (const s of sources) console.log(`  ${s}`);
  process.exit(0);
}

console.log(`• ${found.length} skill(s) trouvé(s):\n`);
for (const skill of found) {
  const status = listOnly
    ? '—'
    : !skill.valid
      ? '✗ frontmatter invalide (name manquant)'
      : fs.existsSync(path.join(SHARED_SKILLS, skill.name))
        ? force
          ? '→ remplacement'
          : '• existe déjà (sauté, --force pour remplacer)'
        : '✓ import';
  console.log(`  ${status}  ${skill.name}${skill.description ? ` — ${skill.description.slice(0, 70)}` : ''}`);
}
if (listOnly) process.exit(0);

// ---- import -------------------------------------------------------------------
fs.mkdirSync(SHARED_SKILLS, { recursive: true });
let imported = 0;
for (const skill of found) {
  if (!skill.valid) continue;
  const target = path.join(SHARED_SKILLS, skill.name);
  if (fs.existsSync(target)) {
    if (!force) continue;
    fs.rmSync(target, { recursive: true, force: true });
  }
  fs.cpSync(skill.dir, target, { recursive: true });
  imported += 1;
}
console.log(`\n✓ ${imported} skill(s) importé(s) vers ${SHARED_SKILLS}`);

// ---- ciblage ------------------------------------------------------------------
function loadScopeFile() {
  if (!fs.existsSync(SCOPE_FILE)) {
    return { schemaVersion: 1, skills: {}, mcpServers: {} };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(SCOPE_FILE, 'utf8'));
    return {
      schemaVersion: 1,
      skills: raw.skills ?? {},
      mcpServers: raw.mcpServers ?? {},
    };
  } catch {
    fail(`manifeste de ciblage corrompu: ${SCOPE_FILE}`);
  }
}
const manifest = loadScopeFile();
for (const skill of found) {
  if (!skill.valid) continue;
  if (!fs.existsSync(path.join(SHARED_SKILLS, skill.name))) continue;
  manifest.skills[skill.name] = audience;
}
fs.mkdirSync(path.dirname(SCOPE_FILE), { recursive: true });
fs.writeFileSync(SCOPE_FILE, JSON.stringify(manifest, null, 2) + '\n');
console.log(`• ciblage enregistré (${audience === 'all' ? 'tous les teammates' : audience.join(', ')}) → ${SCOPE_FILE}`);
console.log('  Le filtre s\'applique au prochain démarrage de session des bots.');
