# Emma

**Emma est une fourche open source de [Cindy](https://github.com/makecindy/cindy)** — le même agent IA complet, avec une identité propre et des points d'extension pensés pour que **vous** ajoutiez les fonctionnalités qui vous manquent : langues, plugins, thèmes, providers.

> Emma = all of Cindy's features, rebranded as an independent open-source product, with first-class extension tooling.

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License" /></a>
  <a href="https://github.com/makecindy/cindy"><img src="https://img.shields.io/badge/upstream-makecindy%2Fcindy-lightgrey.svg" alt="Upstream" /></a>
</p>

---

## Ce qu'Emma sait déjà faire (tout ce que Cindy sait faire)

- **Agent IA sur votre machine** : fichiers, terminal, navigateur, MCP — l'agent travaille directement dans vos dossiers.
- **Tous vos appareils** : desktop (Windows / macOS / Linux), mobile, reprise de session entre appareils, contrôle à distance du bureau depuis le téléphone.
- **Vos modèles, vos abonnements** : bring-your-own providers et subscriptions (`packages/model-providers/`).
- **Plugins ("Ghosts")** : marketplace + installation locale en double-clic `.cindy` + développement depuis un dossier source.
- **Skills, automations, mémoire, planificateur** : le même socle que Cindy.

## Ce qu'Emma ajoute

| Extension | Comment |
|---|---|
| **Une langue** | `node scripts/add-locale.mjs it "Italiano"` → traduire les JSON, c'est tout |
| **Un plugin** | `node scripts/install-local-plugin.mjs --catalog cindy-github` (ou `.cindy`, URL, dossier) |
| **Le nom / l'identité** | `packages/maker-shared/src/branding.ts` + `brandIdentity.ts` (un seul endroit) |
| **Le thème** | `packages/design-tokens/` + Tailwind config desktop |

👉 Le guide complet : **[EXTENDING.md](./EXTENDING.md)** — carte de l'architecture,
recettes pas-à-pas, conventions. L'écosystème de plugins (catalogue git,
packaging, auto-hébergement) : **[docs/ecosystem.md](./docs/ecosystem.md)**.

## Démarrer

```bash
corepack enable        # active pnpm (ou: npm i -g pnpm)
pnpm install
cd apps/desktop
pnpm dev               # développement Electron
pnpm build             # packaging (NSIS / dmg / AppImage)
```

Tests : `pnpm test` (vitest). Les invariants de marque sont verrouillés par
`packages/maker-shared/src/__tests__/brandIdentity.test.ts`.

## Identité Emma

Emma est une **nouvelle identité système**, indépendante de Cindy — les deux apps
peuvent coexister sur la même machine sans se marcher sur les données :

| | Cindy (upstream) | Emma |
|---|---|---|
| Exécutable | `Cindy.exe` | `Emma.exe` |
| Dossier données | `%APPDATA%\CindyGlobal` | `%APPDATA%\EmmaGlobal` |
| Deep-link | `cindy://` | `emma://` |
| appId (global) | `com.xd.cindy` | `com.emma.app` |

Source de vérité : [`packages/maker-shared/src/brandIdentity.ts`](./packages/maker-shared/src/brandIdentity.ts).

## Reverse-engineering report

[`rea-report.md`](./rea-report.md) — analyse REA ([morluto/rea](https://github.com/morluto/rea))
du binaire Cindy installé : architecture du bundle, preuves que cette source correspond
à l'app livrée, et points d'extension identifiés côté binaire.

## Licence & amont

Apache-2.0 — même licence que l'amont. Emma est un fork de
[makecindy/cindy](https://github.com/makecindy/cindy) ; les contributions remontables
sont bienvenues vers l'amont. Voir `LICENSE` et `NOTICE`.
