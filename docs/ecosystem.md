# Écosystème de plugins Emma

Emma est un fork **100 % open source** de Cindy — et son écosystème de plugins
aussi. Tout ce qui suit fonctionne **sans aucun service cloud** : les sources
sont git, locales ou HTTP statique.

## Architecture en une page

```
┌─────────────────────────────────────────────────────────────┐
│  CRÉER   scripts/package-plugin.mjs  (ou ghost_forge_pack   │
│           dans l'app via le skill cindy-plugin-creator)     │
├─────────────────────────────────────────────────────────────┤
│  PUBLIER  dépôt git (votre repo, tags par version)          │
│           + entrée dans config/plugin-catalog.json          │
├─────────────────────────────────────────────────────────────┤
│  INSTALLER  scripts/install-local-plugin.mjs                │
│             ├─ --catalog <id>   (git → package → install)   │
│             ├─ <url>.cindy      (HTTP statique)             │
│             ├─ <fichier.cindy>  (local)                     │
│             └─ <répertoire>     (source directe)            │
├─────────────────────────────────────────────────────────────┤
│  EXÉCUTER   <userData>/owners/<owner>/cindy-brain/_ns/      │
│             _root/<plugin-id>/  → GhostManager              │
│             (trust, namespaces, receipts, enable/disable)   │
└─────────────────────────────────────────────────────────────┘
```

## Le format `.cindy`

Un paquet `.cindy` est un **zip** dont `ghost.json` est à la racine :

```
mon-plugin/
├── ghost.json    ← manifeste (schemaVersion 3, id, version, tools…)
├── main.js       ← entrée Node (si tools déclarés)
├── assets/icon.png
├── locales/en.json
└── …
```

Le manifeste complet est documenté par le skill **`cindy-plugin-creator`**
(embarqué dans l'app, `apps/desktop/resources/system-skills/`) — c'est la
référence autorité des capacités host (outils, UI, réseau, fichiers, MCP…).

## Créer un plugin

**Dans l'app** (recommandé) : le skill `cindy-plugin-creator` + les outils
Forge (`ghost_forge_scaffold` / `ghost_forge_pack` / `ghost_forge_install`)
font tout — scaffold, validation, packaging, installation avec confirmation
des permissions.

**En CLI** (CI, scripts, sans app) :

```bash
node scripts/package-plugin.mjs mon-plugin/
# → mon-plugin/mon-plugin-1.0.0.cindy
```

La validation CLI vérifie le contrat minimal du host : `schemaVersion`,
`id` (`[a-z0-9-]`), `version` semver, et l'existence de tous les fichiers
référencés (entry, icon, node.entry…).

## Installer un plugin

```bash
# Depuis le catalogue Emma (git → package → install, cache locale du repo)
node scripts/install-local-plugin.mjs --catalog cindy-github

# Depuis une URL HTTP(S) statique
node scripts/install-local-plugin.mjs https://exemples.emma.app/plugins/mon-plugin-1.0.0.cindy

# Fichier local
node scripts/install-local-plugin.mjs ./dist/mon-plugin-1.0.0.cindy --force

# Répertoire source (développement)
node scripts/install-local-plugin.mjs ./mon-plugin --force
```

L'installation écrit dans le dépôt de plugins du owner actif
(`<userData>/owners/<owner>/cindy-brain/_ns/_root/<id>/`) — exactement la même
structure que l'install via l'app ou le double-clic sur un `.cindy`.
`--force` sauvegarde l'ancienne version sous `<dir>.bak-<ts>`.

## Skills : import depuis les autres agents + ciblage par teammate

### Importer les skills Claude Code / Codex / projet

Emma lit les skills du répertoire shared `~/.agents/skills/` (et des racines
`.claude/skills` / `.codex/skills` via la sync cross-agent, opt-in dans
l'app). Pour **importer explicitement** les skills d'autres agents :

```bash
node scripts/import-agent-skills.mjs --list                 # scan sans importer
node scripts/import-agent-skills.mjs                        # ~/.claude + ~/.codex → ~/.agents/skills
node scripts/import-agent-skills.mjs <dir-projet>/.claude/skills   # + répertoires explicites
node scripts/import-agent-skills.mjs --force                # remplacer les skills existants
```

Chaque skill importé = un dossier avec `SKILL.md` (frontmatter `name` +
`description`) copié dans `~/.agents/skills/<name>/` — Emma en devient
propriétaire, l'agent d'origine garde sa copie.

### Ciblage par teammate (skills et MCPs)

Par défaut, un skill ou un serveur MCP est visible par **tous les
teammates**. Pour le restreindre à des bots spécifiques, le manifeste
`~/.agents/teammate-scopes.json` :

```json
{
  "schemaVersion": 1,
  "skills": {
    "design-systems": ["Bot Alpha", "Bot Beta"],
    "review-checklist": "all"
  },
  "mcpServers": {
    "notion-mcp": ["Bot Alpha"]
  }
}
```

- Entrée absente = `"all"` (rétrocompatible : manifeste vide = comportement Cindy)
- Liste vide = personne
- Matching par **id de bot** (exact) ou **nom d'affichage** (insensible à la casse)
- Fichier corrompu/absent → tout est autorisé, jamais un crash du runtime

```bash
node scripts/set-teammate-scope.mjs list
node scripts/set-teammate-scope.mjs set skill design-systems "Bot Alpha,Bot Beta"
node scripts/set-teammate-scope.mjs set mcp notion-mcp "Bot Alpha"
node scripts/set-teammate-scope.mjs remove skill design-systems   # retour à "all"
node scripts/import-agent-skills.mjs --scope "Bot Alpha"          # import + ciblage d'un coup
```

**Où ça s'applique** : au démarrage de session, le runtime bot
(`botProfileRuntime.ts`) filtre les catalogues skills et MCPs par audience
avant la résolution allowlist du profil. Un skill/MCP hors audience disparaît
du catalogue — une référence configurée hors audience remonte en
« unavailable » dans les réglages du bot.

Le même mécanisme existe déjà **dans l'app** (par bot) : Réglages du teammate →
capacités, avec allowlist par skill/MCP/toolset. Le manifeste de ciblage est
la vue inverse : depuis le skill/MCP vers les bots, gérable en CLI sans ouvrir
l'app.

## Le catalogue (`config/plugin-catalog.json`)

Liste des plugins disponibles, avec leurs sources git :

```json
{
  "schemaVersion": 1,
  "updated": "2026-11-03",
  "plugins": [
    {
      "id": "cindy-github",
      "name": "GitHub",
      "version": "1.3.0",
      "description": "…",
      "repo": "https://github.com/makecindy/cindy-official-plugins.git",
      "path": "cindy-github",
      "tags": []
    }
  ]
}
```

- Le catalogue embarque **30 plugins** seed issus du dépôt officiel Cindy
  (`makecindy/cindy-official-plugins`) — tous compatibles Emma, qui est un
  fork de Cindy.
- `repo` + `path` pointent vers n'importe quel dépôt git : le vôtre, un
  miroir auto-hébergé, Gitea…
- Pour **auto-héberger**, clonez le dépôt officiel (ou publiez vos plugins
  dans votre repo), mettez à jour les entrées du catalogue, et redistribuez
  la manifeste — l'app n'a besoin d'aucun service Emma.

## Publier un plugin dans l'écosystème Emma

1. **Dépôt git** : un répertoire par plugin contenant `ghost.json` (même
   convention que `cindy-official-plugins` : chaque dossier racine avec
   `ghost.json` est un plugin).
2. **Versionner** : tag git par version (`v1.0.0`) — le catalogue référence
   la branche/tag par défaut du clone, mais vous pouvez pointer n'importe
   quel ref en adaptant l'entrée.
3. **Catalogue** : ajouter l'entrée dans `config/plugin-catalog.json`
   (id, name, version, description, repo, path).
4. **Redistribuer** : le catalogue voyage avec le dépôt Emma ; les utilisateurs
   installent via `--catalog <id>` ou vous servez les `.cindy` sur un HTTP
   statique et ils installent par URL.

## Confiance (trust)

- Les plugins installés localement portent la namespace `local` (défaut des
  installs manuelles) — ils sont isolés des instances « marché »/« entreprise ».
- La confiance signée (`ghost-trust.json`, publishers/reviewers) est le
  mécanisme du host pour les plugins publiés avec signature ; Emma démarre
  avec un registre vide et vous y ajoutez **vos** publishers.
- Chaque installation produit un receipt (preuve d'installation) géré par le
  `GhostManager` — visible dans l'app, auditable sur disque.

## Ce qui reste amont (et comment s'en passer)

| Surface | Dépendance Cindy actuelle | Découplage Emma |
|---|---|---|
| Catalogue de plugins | SkillHub (`skillhubApiBaseUrl`) | `config/plugin-catalog.json` + git ✅ |
| Téléchargement `.cindy` | CDN marketplace | HTTP statique quelconque ✅ |
| Création/packaging | Forge tools (dans l'app) | `scripts/package-plugin.mjs` ✅ |
| Installation | GhostManager (dans l'app) | `scripts/install-local-plugin.mjs` ✅ |
| Signature/review | `ghost-trust.json` (vide) | à alimenter avec vos publishers ⬜ |

Les endpoints SkillHub dans `config/endpoint.global.json` restent configurés
(`*.emma.app`) : si vous allumez un service Emma plus tard, le marché in-app
reprend la main sans changement de code.
