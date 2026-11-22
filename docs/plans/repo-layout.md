# Plan: Repository layout (app / worker / shared / tauri)

Status (2026-11-22): **planned.**

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
│   ├── index.html
│   ├── components.json
│   ├── pwa-assets.config.ts
│   └── tsconfig.json        (was tsconfig.app.json)
├── worker/
│   ├── src/                 (was worker/*.ts, auth/, rooms/)
│   ├── migrations/
│   ├── worker-configuration.d.ts
│   └── tsconfig.json        (was tsconfig.worker.json)
├── shared/
│   └── api.ts               Role, LinkRole, Member, ShareLink, ShareInfo, JoinInfo, JoinStatus
├── tauri/                   (was src-tauri/)
├── docs/
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

- [ ] **1.1** `shared/api.ts` with the types both sides use: `Role` (now in `worker/auth/gate.ts:25`
      and `src/features/sharing/api.ts:23`), `LinkRole`, `Member`, `ShareLink`, `ShareInfo`,
      `JoinInfo`, `JoinStatus` (`worker/auth/invites.ts`).
- [ ] **1.2** `@shared/*` path in the app and Worker tsconfigs, `shared` in both `include`s.
- [ ] **1.3** Both sides import them with `import type`. Type the Worker's share/join responses with
      them, so a changed field fails `tsc -b` on the client.
- [ ] **1.4** oxlint: `shared/**` may not import from `src/` or `worker/`, nor any runtime package.

### Phase 2: `src-tauri/` to `tauri/`

- [ ] **2.1** `git mv src-tauri tauri`. Delete the old `target/` (a cold Rust build follows once).
- [ ] **2.2** `.github/workflows/desktop-release.yml`: `workspaces: tauri` (Rust cache) and
      `cp tauri/target/release/bundle/nsis/...`. Missing the second one breaks the `Jot-setup.exe`
      upload, found only on the next tag.
- [ ] **2.3** Check: `pnpm desktop:dev` opens the window; `pnpm desktop:build` puts the installer in
      `tauri/target/release/bundle/nsis/`.

### Phase 3: web into `app/`

- [ ] **3.1** `git mv` `src/`, `public/`, `index.html`, `components.json`, `pwa-assets.config.ts`,
      `tsconfig.app.json` (as `tsconfig.json`) into `app/`.
- [ ] **3.2** `vite.config.ts`: `root: "app"`, `build.outDir: "../dist"` (`emptyOutDir: true`),
      `@` alias to `app/src`, `cloudflare({ configPath: "../wrangler.jsonc" })` (verify the path
      base), and keep local D1/DO state in the root `.wrangler/` (`persistState`) or re-run
      `pnpm db:migrate`.
- [ ] **3.3** `.oxlintrc.json` globs: `src/**` to `app/src/**`. `.oxfmtrc.json`: Tailwind stylesheet
      and `components/ui` ignore paths. `components.json`: CSS path.
- [ ] **3.4** `pwa:icons`: run the generator from `app/` (or keep the config at the root if the CLI
      cannot be pointed at it). The shadcn CLI needs `--cwd app`; update the command in CLAUDE.md.
- [ ] **3.5** Tauri `beforeDevCommand` (`pnpm dev`): check it still starts on port 5173.

### Phase 4: Worker into `worker/src/`

- [ ] **4.1** `git mv` the Worker files into `worker/src/`, `migrations/` into `worker/migrations/`.
- [ ] **4.2** `wrangler.jsonc`: `main: "worker/src/index.ts"`, `migrations_dir: "worker/migrations"`.
      Moving files does not edit any applied migration (CLAUDE.md "Never").
- [ ] **4.3** `cf-typegen` / `typecheck`: `wrangler types worker/worker-configuration.d.ts`.
      Worker tsconfig `types` path and the `.oxfmtrc.json` ignore follow it.
- [ ] **4.4** oxlint: ban `../` imports in `worker/**` too, now that it has a `src/`.

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
