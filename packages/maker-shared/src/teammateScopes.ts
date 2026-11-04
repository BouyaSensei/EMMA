/**
 * teammateScopes — filtre d'audience par teammate pour skills et MCPs.
 *
 * Emma hérite des skills/MCPs de Cindy, mais l'écosystème local-first ajoute un
 * niveau de ciblage explicite : chaque skill ou serveur MCP peut être visible
 * par **tous les teammates** (`"all"`) ou seulement par une liste de
 * teammates (ids de bot ou noms d'affichage).
 *
 * Stockage : manifeste JSON dans le répertoire shared des skills
 * (`~/.agents/teammate-scopes.json`), inspectable à la main, sans verrou DB.
 *
 *   {
 *     "schemaVersion": 1,
 *     "skills":     { "<skill-name>": "all" | ["<botId|nom>", ...] },
 *     "mcpServers": { "<server-id>":  "all" | ["<botId|nom>", ...] }
 *   }
 *
 * Règles :
 *   - Entrée absente = "all" (rétrocompatible : un manifeste vide ou absent ne
 *     change rien au comportement hérité de Cindy).
 *   - Liste vide = personne (skill/MCP désactivé pour tous les bots).
 *   - Matching par id de bot (exact) OU nom d'affichage (case-insensitive).
 *   - Fichier absent ou corrompu → manifeste vide (tout est autorisé), jamais
 *     un crash du runtime.
 */

export const TEAMMATE_SCOPES_SCHEMA_VERSION = 1;

/** Audience d'une entrée : "all" ou liste de cibles (id de bot / nom). */
export type TeammateAudience = 'all' | string[];

export interface TeammateScopeManifest {
  schemaVersion: typeof TEAMMATE_SCOPES_SCHEMA_VERSION;
  skills: Record<string, TeammateAudience>;
  mcpServers: Record<string, TeammateAudience>;
}

export interface BotIdentity {
  /** Id interne du bot (uuid) — matching exact. */
  id: string;
  /** Nom d'affichage — matching case-insensitive. */
  displayName?: string | null;
}

const EMPTY_MANIFEST: TeammateScopeManifest = Object.freeze({
  schemaVersion: TEAMMATE_SCOPES_SCHEMA_VERSION,
  skills: Object.freeze({}),
  mcpServers: Object.freeze({}),
}) as TeammateScopeManifest;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0);
}

function parseAudience(key: string, value: unknown, errors: string[]): TeammateAudience | null {
  if (value === 'all') return 'all';
  if (isStringArray(value)) return value;
  errors.push(`${key}: audience invalide (attendu "all" ou ["<botId|nom>", ...])`);
  return null;
}

function parseSection(
  source: Record<string, unknown> | undefined,
  label: string,
  errors: string[],
): Record<string, TeammateAudience> {
  const out: Record<string, TeammateAudience> = {};
  if (!source) return out;
  for (const [key, value] of Object.entries(source)) {
    const audience = parseAudience(`${label}.${key}`, value, errors);
    if (audience !== null) out[key] = audience;
  }
  return out;
}

/**
 * Parser strict. `null` si la structure de premier niveau est invalide ; les
 * entrées individuelles mal formées sont rejetées avec un message dans
 * `errors` (le reste du manifeste reste utilisable).
 */
export function parseTeammateScopeManifest(
  value: unknown,
  errors: string[] = [],
): TeammateScopeManifest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push('manifeste : objet JSON attendu');
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== TEAMMATE_SCOPES_SCHEMA_VERSION) {
    errors.push(`schemaVersion doit être ${TEAMMATE_SCOPES_SCHEMA_VERSION}`);
    return null;
  }
  return {
    schemaVersion: TEAMMATE_SCOPES_SCHEMA_VERSION,
    skills: parseSection(
      record.skills as Record<string, unknown> | undefined,
      'skills',
      errors,
    ),
    mcpServers: parseSection(
      record.mcpServers as Record<string, unknown> | undefined,
      'mcpServers',
      errors,
    ),
  };
}

/**
 * Un skill/MCP est dans l'audience du bot si :
 *   - aucune entrée pour lui → oui (défaut ouvert),
 *   - audience "all" → oui,
 *   - liste → le bot y figure par id exact ou nom d'affichage (ci).
 */
export function isInTeammateAudience(
  manifest: TeammateScopeManifest | null,
  kind: 'skill' | 'mcp',
  entryName: string,
  bot: BotIdentity,
): boolean {
  if (!manifest) return true;
  const section = kind === 'skill' ? manifest.skills : manifest.mcpServers;
  const audience = section[entryName];
  if (audience === undefined || audience === 'all') return true;
  if (audience.length === 0) return false;
  const name = bot.displayName?.trim().toLowerCase();
  return audience.some((target) => {
    if (target === bot.id) return true;
    if (name && target.toLowerCase() === name) return true;
    return false;
  });
}

/** Manifeste vide : tout est autorisé. */
export function emptyTeammateScopeManifest(): TeammateScopeManifest {
  return EMPTY_MANIFEST;
}
