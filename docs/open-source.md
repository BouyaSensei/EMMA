# Emma — ce qui est ouvert, et où ça parle à l'amont

Emma est **100 % open source (Apache-2.0)** : tout le code client — desktop, mobile,
packages partagés, plugins officiels, i18n, outils d'extension — est dans ce dépôt.
Il n'y a pas de binaire propriétaire dans l'app elle-même.

## Services : Emma parle à ses propres endpoints (découplage 2026-11)

Tous les points d'accès réseau sont centralisés **dans un seul fichier** — la
manifeste d'endpoints :

```
config/endpoint.global.json     # région global (défaut) → *.emma.app
config/endpoint.json            # région cn → *.emma.cn
config/endpoint.dev.json        # région dev (exemple fourni)
config/endpoint-manifest-mirrors.json  # miroir GitHub de secours
```

**Comment la résolution fonctionne au démarrage** (main, bloquant) :

1. L'app fetch `{cdnBaseUrl}/endpoint.json` depuis le CDN d'Emma
   (`https://hotfix.emma.app/emma/endpoint.json` par défaut).
2. Sur échec réseau : cache locale validée → **manifeste embarquée dans le
   binaire** (le fichier `config/endpoint.global.json` est compilé dans
   l'app via `packages/maker-shared/src/clientEndpointResilience.ts`) →
   l'app démarre donc **hors-ligne dès la première installation**, sans
   dépendre d'aucun service.
3. Miroir GitHub de secours (`endpoint-manifest-mirrors.json`, repo Emma).

Chaque clé (`authApiBaseUrl`, `pluginApiBaseUrl`, `skillhubApiBaseUrl`,
`cdnBaseUrl`, …) pointe par défaut vers l'infrastructure Emma ; redirigez-la
vers **votre** infrastructure en editant la manifeste (repo ou CDN) — sans
toucher au code.

**Ancre de confiance** : les domaines acceptés pour une cache/manifeste sont
fixés dans le source (`REGION_ENDPOINT_DOMAIN` dans
[`packages/maker-shared/src/clientEndpointOrigins.ts`](../packages/maker-shared/src/clientEndpointOrigins.ts)):
`emma.app` (global) et `emma.cn` (cn). C'est l'équivalent du pinning de
certificat : il ne peut pas être changé à distance. Migration de domaine =
modifier cette constante + la manifeste, puis recompiler.

| Service | Clé | Rôle |
|---|---|---|
| Compte / sign-in | `authApiBaseUrl` | Connexion multi-appareils |
| Relay de sessions | `chatApiBaseUrl` | Reprendre une session sur un autre appareil |
| Marketplace plugins | `pluginApiBaseUrl` | Recherche + téléchargement de `.cindy` |
| SkillHub | `skillhubApiBaseUrl` / `cindySkillHubApiBaseUrl` | Skills partagés |
| Updates desktop | `cdnBaseUrl` | Auto-update NSIS/dmg/AppImage |
| Heartbeat / hooks | `heartbeatUrl`, `*HookWsUrl` | Bots (Telegram, X, Slack) |

## Ce qui fonctionne 100 % local (sans aucun service amont)

- L'agent dans vos dossiers (fichiers, terminal, MCP, skills).
- Les plugins installés localement (`scripts/install-local-plugin.mjs`, double-clic `.cindy`).
- Les langues (`scripts/add-locale.mjs`) et le thème.
- Les modèles : tout provider BYO (API key, abonnements supportés, modèles locaux).

## Différences d'identité avec Cindy

Emma a sa propre identité système (exe `Emma.exe`, `%APPDATA%\EmmaGlobal`,
deep-link `emma://`, appId `com.emma.*`) — voir
[`packages/maker-shared/src/brandIdentity.ts`](../packages/maker-shared/src/brandIdentity.ts).
Côté mobile : bundle `com.emma.emma` / `com.emma.emmecn`, schemes
`emma` / `emmecn` / `emmadev` (`apps/mobile/app.config.js`).
Les anciens schemes Cindy (`cindy://`, `cindycn://`, …) restent **acceptés en
lecture** (deep-links, invitations, partages) pour la compatibilité
cross-appareils avec les installs Cindy existants — ils ne sont plus générés.
Cindy et Emma peuvent coexister sur la même machine.

Les identifiants internes hérités (dossier `cindy-brain`, préfixes de DB,
clés de réglages) sont conservés volontairement pour la compatibilité des
données ; la liste autorité est dans les commentaires de `brandIdentity.ts`.
