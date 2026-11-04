/**
 * teammate-scope-store — lecture du manifeste de ciblage par teammate.
 *
 * Fichier : `~/.agents/teammate-scopes.json` (à côté du shared skill root).
 * Contracté pour ne JAMAIS faire échouer le runtime bot : fichier absent,
 * illisible ou corrompu → manifeste vide (tout est autorisé), avec un log
 * d'avertissement une fois par processus.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  emptyTeammateScopeManifest,
  parseTeammateScopeManifest,
  type TeammateScopeManifest,
} from '@cindy/maker-shared/teammate-scopes';

export function teammateScopesPath(homeDir = os.homedir()): string {
  return path.join(homeDir, '.agents', 'teammate-scopes.json');
}

let warned = false;

/** Lit le manifeste ; toute défaillance renvoie le manifeste vide (tout ouvert). */
export function readTeammateScopeManifest(homeDir?: string): TeammateScopeManifest {
  try {
    const file = teammateScopesPath(homeDir);
    if (!fs.existsSync(file)) return emptyTeammateScopeManifest();
    const raw = fs.readFileSync(file, 'utf8');
    const errors: string[] = [];
    const manifest = parseTeammateScopeManifest(JSON.parse(raw), errors);
    if (!manifest) {
      if (!warned) {
        warned = true;
        console.warn(`[teammate-scopes] manifeste ignoré (${file}): ${errors.join('; ')}`);
      }
      return emptyTeammateScopeManifest();
    }
    if (errors.length && !warned) {
      warned = true;
      console.warn(`[teammate-scopes] entrées ignorées (${file}): ${errors.join('; ')}`);
    }
    return manifest;
  } catch {
    if (!warned) {
      warned = true;
      console.warn('[teammate-scopes] lecture impossible, tout est autorisé');
    }
    return emptyTeammateScopeManifest();
  }
}
