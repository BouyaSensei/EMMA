# Extending Emma

Emma est une fourche open source de [Cindy](https://github.com/makecindy/cindy) (Apache-2.0).
Tout ce que Cindy sait faire, Emma le sait faire — et ce document explique comment y ajouter
**vos** fonctionnalités avec un minimum de code.

> English summary below the French sections.

---

## 1. Carte de l'architecture

| Sous-système | Emplacement | Rôle |
|---|---|---|
| App desktop (Electron) | `apps/desktop/` | UI, main process, preload, workers |
| Mobile (Expo) | `apps/mobile/` | Client mobile |
| Headless agent | `apps/cindy-headless/` | Agent sans interface |
| Branding / identité | `packages/maker-shared/src/branding.ts`, `brandIdentity.ts` | Nom affiché + identifiants système (exe, appId, scheme, dossiers) |
| i18n (langues UI) | `apps/desktop/src/renderer/i18n/locales/<lang>/*.json` | Traductions par langue |
| Registre des langues | `apps/desktop/src/shared/locale.ts` (`SUPPORTED_LOCALES`) | Liste des langues disponibles dans les réglages |
| Protocole plugins | `packages/plugin-protocol/` | Format du manifeste `ghost.json`, livraison, CSP |
| Cœur plugins ("Ghosts") | `apps/desktop/src/main/cindy-brain/` | Installation, exécution, marketplace, OAuth des plugins |
| Providers de modèles | `packages/model-providers/` | Connecteurs LLM |
| Outils agent | `packages/cindy-tools/`, `packages/maker-core/` | Outillage des agents (bash, fichiers, MCP…) |

Règle d'or : **le nom affiché et l'identité système vivent dans un seul fichier chacun**
(`branding.ts` / `brandIdentity.ts`). Le reste du code consomme ces constantes —
c'est ce qui rend les extensions ci-dessous possibles sans chasse aux chaînes.

---

## 2. Ajouter une langue (30 secondes)

```bash
node scripts/add-locale.mjs <locale> ["Nom Affiché"]
# exemples:
node scripts/add-locale.mjs it "Italiano"
node scripts/add-locale.mjs tr "Türkçe"
```

Le script fait tout le câblage :

1. crée `apps/desktop/src/renderer/i18n/locales/<locale>/` en copiant les JSON anglais comme modèle ;
2. ajoute les `import` + l'entrée `resources` dans `renderer/i18n/index.ts` ;
3. enregistre le locale dans `SUPPORTED_LOCALES` (`shared/locale.ts`) → il apparaît dans Réglages → Langue.

Il reste à **traduire** `locales/<locale>/common.json` (et `aiRename.json`).
Les clés manquantes retombent automatiquement sur l'anglais, vous pouvez donc traduire par lots.

Conventions :

- Suivez le glossaire `i18n/GLOSSARY.md` et les notes `i18n/LOCALE_NOTES.md`.
- Le nom de l'app dans les textes est injecté via `{{appName}}` — ne le traduisez pas,
  il suit `BRAND_NAME` automatiquement.
- Pour ajouter un *namespace* de traduction en plus de `common`/`aiRename`,
  créez le JSON, ajoutez l'import + l'entrée dans `i18n/index.ts` et la ns dans le tableau `ns:` du même fichier.

---

## 3. Ajouter un plugin

Un plugin ("Ghost") = un dossier avec un manifeste `ghost.json` + son code,
packagé en `.cindy` (zip). Cinq façons d'installer :

| Méthode | Quand l'utiliser |
|---|---|
| Marketplace (Réglages → Plugins) | Plugin déjà publié sur votre infrastructure Emma |
| Double-clic sur un fichier `.cindy` | Partage local (association de fichiers enregistrée au premier lancement) |
| `node scripts/install-local-plugin.mjs --catalog <id>` | **Catalogue Emma** : git → package → install, sans service cloud |
| `node scripts/install-local-plugin.mjs <dossier\|.cindy\|https://…> [--force]` | Installation en ligne de commande dans `%APPDATA%\EmmaGlobal\owners\<owner>\cindy-brain\_ns\_root\<id>\` |
| Demander à l'agent (`ghost_forge_scaffold` / `ghost_forge_install`) | Développer un plugin depuis son dossier source, installation directe |

Packaging CLI (équivalent de `ghost_forge_pack`) :

```bash
node scripts/package-plugin.mjs mon-plugin/   # → mon-plugin/mon-plugin-0.1.0.cindy
```

Skills : import depuis les autres agents + ciblage par teammate :

```bash
node scripts/import-agent-skills.mjs --list          # scan ~/.claude + ~/.codex
node scripts/import-agent-skills.mjs --scope "Bot A" # import + ciblage
node scripts/set-teammate-scope.mjs list             # voir les ciblages skills/MCPs
node scripts/set-teammate-scope.mjs set mcp notion-mcp "Bot A"
```

L'écosystème complet (catalogue, publication, auto-hébergement, trust) est
documenté dans [`docs/ecosystem.md`](docs/ecosystem.md).

### Développer son propre plugin (recette minimale)

```
mon-plugin/
├── ghost.json          # manifeste: id, name, version, tools[], ...
└── index.js            # code du plugin (Node, sandboxé par Emma)
```

`ghost.json` minimal :

```json
{
  "id": "mon-plugin",
  "name": "Mon Plugin",
  "version": "0.1.0",
  "description": "Ce que fait le plugin",
  "tools": [
    { "name": "hello", "description": "Dit bonjour", "parameters": { "type": "object" } }
  ]
}
```

Puis : `node scripts/install-local-plugin.mjs mon-plugin` → redémarrez Emma.
Le plugin apparaît dans Réglages → Plugins ; l'agent peut l'appeler via `ghost_call`.

Le contrat complet (permissions, stockage, OAuth, manuel) est documenté dans
`packages/plugin-protocol/` et le skill `cindy-plugin-creator` de Cindy/Emma.

---

## 4. Rebranding & thème

| Ce que vous voulez changer | Fichier | Effet |
|---|---|---|
| Nom affiché (UI, LLM, titre) | `packages/maker-shared/src/branding.ts` → `BRAND_NAME` | Tout le UI via `{{appName}}` |
| exe / dossier données / deep-link / appId | `packages/maker-shared/src/brandIdentity.ts` → `BRAND_IDENTITY` | Identité système complète (tests d'invariants dans `brandIdentity.test.ts`) |
| Couleurs / typographie | `packages/design-tokens/` + `apps/desktop/tailwind.config.ts` | Thème global |
| Icône | `appicon/` (racine du repo) | Regénérée au packaging |

Identifiants **volontairement conservés** (compatibilité données/protocole avec l'amont Cindy,
ne pas renommer sans plan de migration) : dossiers internes `cindy-brain`, préfixes de DB
historiques, clés de réglages héritées. La liste autorité est dans les commentaires de
`brandIdentity.ts`.

---

## 5. Autres points d'extension

- **Provider de modèle** : `packages/model-providers/` — un module par famille de modèles ;
  la compatibilité passe par `packages/model-compat/`.
- **Outils agent** : `packages/cindy-tools/` + `packages/maker-core/` (outils natifs) et
  n'importe quel serveur MCP via les réglages.
- **Skills** : dossiers `SKILL.md` sous `.agents/skills/` (repo) ou le SkillHub ;
  voir le skill `cindy-skill-creator`.
- **Raccourcis / recettes navigateur** : `apps/desktop/src/main/browser-control-runtime/`
  et le catalogue de recettes.

---

## 6. Services amont vs local

Quelques services cloud (compte, marketplace, auto-update) pointent par défaut
vers l'infrastructure Cindy — tout est centralisé dans `config/endpoint.global.json`
(redirigeable vers votre propre infra). Voir [`docs/open-source.md`](./docs/open-source.md).

## 7. Construire & lancer

```bash
corepack enable            # active pnpm (ou: npm i -g pnpm)
pnpm install
cd apps/desktop
pnpm dev                   # mode développement (Electron Forge)
pnpm build                 # packaging NSIS / dmg / AppImage selon la plateforme
```

Tests : `pnpm test` à la racine (vitest par package). Les invariants de marque sont
verrouillés par `packages/maker-shared/src/__tests__/brandIdentity.test.ts`.

---

## REA report

L'analyse reverse-engineering de l'app Cindy livrée (via le skill REA, repo
[morluto/rea](https://github.com/morluto/rea)) est dans [`rea-report.md`](./rea-report.md) :
elle documente l'architecture du binaire installé et sert de preuve que cette source
correspond à l'app livrée.
