#!/usr/bin/env node
/**
 * set-teammate-scope.mjs — gère le ciblage par teammate de skills et MCPs.
 *
 * Manifeste : ~/.agents/teammate-scopes.json
 *   { "schemaVersion": 1,
 *     "skills":     { "<nom>": "all" | ["<botId|nom>", ...] },
 *     "mcpServers": { "<id>":  "all" | ["<botId|nom>", ...] } }
 *
 * Règle : entrée absente = "all" (tout le monde). Liste vide = personne.
 *
 * 用法:
 *   node scripts/set-teammate-scope.mjs list
 *   node scripts/set-teammate-scope.mjs skill <nom> all
 *   node scripts/set-teammate-scope.mjs skill <nom> "Bot A,Bot B"
 *   node scripts/set-teammate-scope.mjs mcp <id> "Bot A"
 *   node scripts/set-teammate-scope.mjs remove skill <nom>     # retour à "all"
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const SCOPE_FILE = path.join(os.homedir(), '.agents', 'teammate-scopes.json');

function load() {
  if (!fs.existsSync(SCOPE_FILE)) return { schemaVersion: 1, skills: {}, mcpServers: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(SCOPE_FILE, 'utf8'));
    if (raw.schemaVersion !== 1) fail(`schemaVersion inattendu: ${raw.schemaVersion}`);
    return { schemaVersion: 1, skills: raw.skills ?? {}, mcpServers: raw.mcpServers ?? {} };
  } catch (err) {
    fail(`manifeste illisible (${SCOPE_FILE}): ${err.message}`);
  }
}

function save(manifest) {
  fs.mkdirSync(path.dirname(SCOPE_FILE), { recursive: true });
  fs.writeFileSync(SCOPE_FILE, JSON.stringify(manifest, null, 2) + '\n');
}

function parseAudience(value) {
  if (value === 'all') return 'all';
  const list = value.split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.length) fail('audience vide (utilisez "all" ou une liste: "Bot A,Bot B")');
  return list;
}

const [cmd, kind, name, audienceArg] = process.argv.slice(2);

if (!cmd || cmd === 'list') {
  const m = load();
  const section = (label, entries) => {
    const keys = Object.keys(entries);
    console.log(`\n${label} (${keys.length}):`);
    if (!keys.length) console.log('  (rien — tout est ouvert à tous les teammates)');
    for (const key of keys.sort()) {
      const a = entries[key];
      console.log(`  ${key}: ${a === 'all' ? 'tous' : a.length ? a.join(', ') : 'personne'}`);
    }
  };
  section('Skills', m.skills);
  section('MCP servers', m.mcpServers);
  process.exit(0);
}

if (cmd === 'remove') {
  if (!['skill', 'mcp'].includes(kind) || !name) fail('usage: remove skill <nom> | remove mcp <id>');
  const m = load();
  const section = kind === 'skill' ? m.skills : m.mcpServers;
  if (!(name in section)) {
    console.log(`• ${name} n'était pas ciblé (déjà "all")`);
    process.exit(0);
  }
  delete section[name];
  save(m);
  console.log(`✓ ${name} → tous les teammates (entrée supprimée)`);
  process.exit(0);
}

if (cmd === 'set') {
  if (!['skill', 'mcp'].includes(kind) || !name || !audienceArg)
    fail('usage: set skill <nom> all|"<bots>" | set mcp <id> all|"<bots>"');
  const m = load();
  const section = kind === 'skill' ? m.skills : m.mcpServers;
  section[name] = parseAudience(audienceArg);
  save(m);
  console.log(`✓ ${name} → ${audienceArg === 'all' ? 'tous les teammates' : audienceArg}`);
  console.log('  Effectif au prochain démarrage de session des bots.');
  process.exit(0);
}

fail(`commande inconnue: ${cmd}\nusage: list | set skill|mcp <nom> all|"<bots>" | remove skill|mcp <nom>`);
