# Plan: Repository layout (app / worker / shared / tauri)

Status (2026-11-22): **phase 1 done.**

Goal: a root that reads as "app, worker, shared types, desktop shell", and one source of truth for the
types the client and the Worker both use. No change to what ships, how it deploys or how it runs.

## Decisions (owner, 2026-11-22)

| Topic          | Choice                                                                                                                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo       | **No** workspaces, no Turbo, no Bun. Still one `package.json` and one lockfile. Jot is one deployable (the Vite build ships the SPA and the Worker as one `wrangler deploy`, same origin), so a package split adds tooling, no gain |
| Folders        | `app/` (browser / PWA), `worker/` (Cloudflare Worker), `shared/` (types only), `tauri/` (Rust shell, was `src-tauri/`)                                                                                                              |
| Root configs   | `vite.config.ts`, `wrangler.jsonc`, lint/format configs and `package.json` stay at the root: they build and deploy everything together                                                                                              |
| `shared/` rule | **Types only**, imported with `import type`. No runtime code: it would have to run in both the browser and workerd. Revisit when a real shared function shows up                                                                    |
| Later          | A real workspace split only when a second deployable with its own release appears                                                                                                                                                   |

## Target layout

```
jot/
├── app/
│   ├── src/                 (was src/, unchanged inside)
│   ├── public/
│   ├── components.json
│   ├── pwa-assets.config.ts
│   └── tsconfig.json        (was tsconfig.app.json)
├── worker/
│   ├── src/                 (was worker/*.ts, auth/, rooms/)
│   ├── migrations/
│   ├── worker-configuration.d.ts
│   └── tsconfig.json        (was tsconfig.worker.json)
├── shared/
│   └── api.ts               share/join API types (Role, Member, ShareInfo, JoinInfo, ...)
├── tauri/                   (was src-tauri/)
├── docs/
├── index.html               Vite entry: stays at the Vite root (phase 3)
├── vite.config.ts
├── wrangler.jsonc
├── tsconfig.json            references app/, worker/, tsconfig.node.json
├── tsconfig.node.json
└── package.json, .oxlintrc.json, .oxfmtrc.json, README.md, CLAUDE.md
```

## Phases

Each phase is its own commit, moved with `git mv` so history follows the files. Run `pnpm check`
after each one.

### Phase 1: `shared/` types

- [x] **1.1** `shared/api.ts` with the types both sides use: `Role` (was in `worker/auth/gate.ts`
      and `src/features/sharing/api.ts`), `LinkRole` (was `InviteRole` in `worker/share.ts`),
      `Member`, `ShareLink`, `ShareInfo`, `AcceptedShare`, `SharedNotes`, `JoinInfo`. `JoinStatus`
      stays in `worker/auth/invites.ts`: it never leaves the Worker.
- [x] **1.2** `@shared/*` path in the app and Worker tsconfigs, `shared` in both `include`s. No Vite
      alias: `import type` is erased, so the bundler never resolves it.
- [x] **1.3** Both sides import them with `import type` (the Worker as `@shared/api.ts`, like its
      other imports). The Worker's share/join responses use `satisfies`. Checked: a changed field
      fails `tsc -b` in both the Worker and the client.
- [x] **1.4** oxlint: `shared/**` may import nothing but its own files (checked with a `yjs` import).

### Phase 2: `src-tauri/` to `tauri/`

- [x] **2.1** Moved `src-tauri/` to `tauri/` (whole folder, `target/` included; git sees 24
      renames). The Tauri CLI finds `tauri/tauri.conf.json` on its own (`pnpm tauri info`).
- [x] **2.2** `.github/workflows/desktop-release.yml`: `workspaces: tauri` (Rust cache) and
      `cp tauri/target/release/bundle/nsis/...`. Missing the second one breaks the `Jot-setup.exe`
      upload, found only on the next tag. Also every `src-tauri` path in CLAUDE.md, README,
      `project-context.md` and `src/desktop/` comments (old plans keep the old name: history).
- [x] **2.3** Check: `pnpm desktop:dev` opens the window; `pnpm desktop:build` puts the installer in
      `tauri/target/release/bundle/nsis/`. Both checked (2026-11-22): `Jot_0.1.1_x64-setup.exe`
      lands there; the local run ends on the missing signing key, expected (CI has it). A first
      local build needs NSIS from GitHub, which can time out on a slow link (`timeout: global`):
      unzip `nsis-3.13.zip` into `%LOCALAPPDATA%\tauri\NSIS` and put `nsis_tauri_utils.dll`
      (v0.5.3) in its `Plugins/x86-unicode/additional/`.

### Phase 3: web into `app/`

**Changed (owner, 2026-11-22): the Vite root stays the repo root, and `index.html` stays there.**
The Cloudflare plugin writes the deploy redirect (`.wrangler/deploy/config.json`) and local D1/DO
state into the Vite root. With `root: "app"` the redirect lands in `app/.wrangler/`, which
`wrangler deploy` run from the repo root never finds (it looks upwards): it would ship the Worker
without the site, silently.

- [x] **3.1** `git mv` `src/`, `public/`, `components.json`, `pwa-assets.config.ts` and
      `tsconfig.app.json` (as `tsconfig.json`) into `app/`.
- [x] **3.2** `vite.config.ts`: `publicDir: "app/public"`, `@` alias to `app/src`. `index.html`
      loads `/app/src/main.tsx`. Root `tsconfig.json` references `./app`; the app tsconfig points
      `tsBuildInfoFile` and `@shared` one level up.
- [x] **3.3** `.oxlintrc.json` globs `app/src/**`. `.oxfmtrc.json`: Tailwind stylesheet and the
      `components/ui` ignore. `components.json` unchanged (its paths are relative to itself).
- [x] **3.4** `pwa:icons` runs `pwa-assets-generator --root app` (config and images resolve from
      `app/`). The shadcn CLI needs `-c app`.
- [x] **3.5** Checked: build output unchanged in shape (`dist/client`, `dist/jot`, redirect still in
      the root `.wrangler/deploy/`), every `app/public` file in the precache (30 entries), none
      over 2 MiB, nothing written under `app/`. `pnpm dev` serves `/`, `/app/src/main.tsx`,
      `/favicon.svg`, `/privacy` and `/api/auth/get-session`.

### Phase 4: Worker into `worker/src/`

- [x] **4.1** `git mv` the Worker files into `worker/src/`, `migrations/` into `worker/migrations/`.
- [x] **4.2** `wrangler.jsonc`: `main: "worker/src/index.ts"`, `migrations_dir: "worker/migrations"`.
      Moving files does not edit any applied migration (CLAUDE.md "Never").
- [x] **4.3** `cf-typegen` / `typecheck`: `wrangler types worker/worker-configuration.d.ts`.
      Worker tsconfig `types` path and the `.oxfmtrc.json` ignore follow it.
- [x] **4.4** oxlint: ban `../` imports in `worker/**` too, now that it has a `src/`.

Phase 4 checked (2026-11-25): `tsc -b` still types the Worker (a planted type error fails it);
`db:migrate` reports nothing to apply (D1 tracks migrations by file name, not path); `wrangler
deploy --dry-run` reads the 30 files from `dist/client`; `tsconfig.worker.json` became
`worker/tsconfig.json`, referenced from the root `tsconfig.json`; the lint rule fires on a planted
`../` import. Under `wrangler dev`: `/` 200, `/api/*` and `/parties/*` 401 signed out, and the
sign-out browser checks (note-list-sync task 6) pass.

### Phase 5: docs

- [ ] **5.1** `docs/project-context.md` §5 layout, and every `src-tauri/` and `src/` path (§6, §11).
- [ ] **5.2** `CLAUDE.md` (lint paths, `tauri/capabilities/`, shadcn command), README (layout,
      icons, release steps).
- [ ] **5.3** Comments that name paths (`app/src/desktop/events.ts`, `hotkey-dialog.tsx`,
      `features/sharing/api.ts`, `invite-link.ts`). Old plans stay as they are (history).

## Check before merging

- [ ] `pnpm check`
- [ ] `pnpm build && pnpm preview`: service worker installs, offline start works, every precached
      file under 2 MiB
- [ ] `pnpm preview:worker`: Google login, the permission guard (viewer cannot edit), share and join
      links
- [ ] Two tabs, one offline: edits sync after reconnecting
- [ ] `pnpm desktop:dev`: window, tray, hotkey
- [ ] `pnpm run deploy` from CI after merge: the deploy workflow commands are unchanged

## Watch out

- `vite.config.ts` and `wrangler.jsonc` must stay together at the root: the Cloudflare plugin builds
  the Worker inside the Vite build, and one deploy keeps one origin (§11).
- Changing Vite's `root` moves default paths that are relative to it (`publicDir`, `envDir`,
  `outDir`, the plugin's local state). Set the ones that matter explicitly.
- The desktop release breaks silently until a tag is pushed: test `pnpm desktop:build` locally.
