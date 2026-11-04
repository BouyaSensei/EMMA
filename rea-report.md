# Emma — REA Reverse-Engineering Report

Subject: installed Cindy desktop app v42.11.12 (`C:\Users\ax_95\AppData\Local\Programs\Cindy`),
source commit `0a7d5a419f5cd3e0fbebc9642dde8388376a68aa`, ASAR extracted to `E:\REA\cindy-asar`.

Tool: REA (`morluto/rea`) JavaScript application analysis, profile `javascript-application`,
targeting the 64 main-process bundle files (`.vite/build/*.js`), 4 GB heap.
Evidence JSON: `E:\REA\rea-analysis5.json` (273 MB).

## Headline numbers (from REA evidence)

| Metric | Value |
|---|---|
| Relevant files in ASAR | 6,932 |
| Parsed main-process JS bundles | 64 |
| AST nodes visited | 7,659,291 |
| Findings | 6,759 |
| IPC operations (main) | 1,790 (1,425 literal channels, 42 dynamic) |
| Exposed API members (preload surface) | 2,043 across 16 contextBridge APIs |
| Renderer IPC transmissions | 1,588 |
| Sender-validation observations | 28 |
| Utility processes | 1 |
| Native addon bindings (resolved in main) | 0 |

## What this tells us about Cindy's architecture

1. **One large Electron main bundle** — the entire desktop backend ships as Vite-bundled
   `.js` files inside `resources/app.asar`. There is no separate sidecar process for core
   features; a single utility process exists (worker pool).
2. **IPC-heavy surface** — ~1,800 IPC operations and 2,043 exposed API members mean the
   renderer talks to main almost exclusively through a wide, typed bridge. Extension points
   therefore live in *main-process* services, not in the UI.
3. **Plugin ("ghost") system is first-class** — the source tree (`apps/desktop/src/main/`)
   contains dedicated plugin runtime modules: `mcp-integrations`, `mcp-apps`, ghost workdir
   gating, plugin file access, and a roster/manual/call protocol surfaced to agents as
   `ghost_list` / `ghost_info` / `ghost_manual` / `ghost_call`. Plugins are `.cindy` packages
   (zip with `ghost.json`) installed into a per-owner plugin directory.
4. **Brand identity is centralized** — `packages/maker-shared/src/brandIdentity.ts` and
   `branding.ts` are the single source for app name, exe name, deep-link scheme, userData
   directories, updater feed and CDN prefixes. Every other surface (deep links, device-link
   invitations, Windows protocol registration, provider attribution headers) derives from it.
5. **i18n is locale-file driven** — `apps/desktop/src/renderer/locales/<lang>/*.json` plus a
   generated index; adding a language = add a folder + register in the index (now scripted).

## How Emma uses these findings

- Rebrand goes through the two brand modules only (plus explicit legacy-scheme handling for
  cross-device compatibility with existing Cindy installs: `emma://` primary, `cindy://` and
  `xdt-maker://` accepted as legacy).
- Extension mechanism is documented and scripted (`EXTENDING.md`,
  `scripts/add-locale.mjs`, `scripts/install-local-plugin.mjs`) on top of the existing
  locale + ghost-plugin systems REA confirmed.
- Upstream service boundaries (auth, chat, plugins, CDN) are centralized in
  `config/endpoint.global.json` — documented in `docs/open-source.md` as the seam where an
  open-source deployment can point at self-hosted services.

## Limitations

- Analysis covered the 64 main-process bundles; renderer chunks and worker files were
  inventoried (6,932 files) but not semantically parsed (resource budget).
- REA runs #1–#4 over the full ASAR timed out / OOM'd at default heap; #5 used the targeted
  subset with `--max-heap-mb 4096` and completed.
