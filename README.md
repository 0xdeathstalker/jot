# Jot

A fast, local-first notes app that syncs across your devices (Windows, iPhone, anything with a browser) within about a second, and works offline.

Built as a PWA on React + TipTap + Yjs, synced through Cloudflare Durable Objects. It runs entirely on Cloudflare's free plan.

> Early development. See the build plan in [`docs/project-context.md`](docs/project-context.md#10-build-plan-do-these-in-order-each-phase-gets-a-plan-in-docsplans).

---

## Features

- **Instant**: every edit is saved locally first, so typing never waits on the network
- **Real-time sync** across devices over WebSockets
- **Offline-first**: edits made offline merge automatically on reconnect (Yjs CRDTs)
- **Installable** on Windows (Edge/Chrome) and iPhone (Safari → Add to Home Screen)
- **Sharing** _(planned)_: collaborate on a note with a few people, live

## Tech stack

| Layer   | Tool                                                    |
| ------- | ------------------------------------------------------- |
| UI      | React, Vite, TypeScript, Tailwind CSS v4, shadcn/ui     |
| Editor  | TipTap (open source, headless)                          |
| Sync    | Yjs + `y-partyserver`                                   |
| Server  | Cloudflare Worker + Durable Objects (one per note)      |
| Storage | IndexedDB (client), Durable Object SQLite + D1 (server) |
| Tooling | pnpm, oxlint, oxfmt, Husky + lint-staged                |
| Hosting | Cloudflare Workers                                      |

---

## Getting started

### Prerequisites

- Node.js 20+ and [pnpm](https://pnpm.io/installation) (`corepack enable` works)
- A free [Cloudflare account](https://dash.cloudflare.com/sign-up) (only needed to deploy)

### Install and run

```bash
git clone <repo-url> jot
cd jot
pnpm install
pnpm dev
```

`pnpm dev` starts Vite and a local simulation of the Cloudflare Worker and Durable Objects together. Nothing touches your Cloudflare account.

### Check that sync works

_Available from Phase 1 onwards._

1. Open `http://localhost:5173/?note=test` in two browser tabs.
2. Type in one tab, and it should appear in the other.
3. Set one tab offline (DevTools → Network → Offline), edit in both, then go back online. Both edits should be kept.

---

## Deploy

```bash
pnpm exec wrangler login     # first time only
pnpm deploy
```

This builds the app and deploys a single Worker that serves both the PWA and the sync server. It's live at `https://jot.<your-account>.workers.dev`.

To use your own domain, add it in the Cloudflare dashboard under **Workers & Pages → jot → Settings → Domains & Routes → Add custom domain**. The domain's DNS must be on Cloudflare.

## Install on devices

- **Windows:** open the site in Edge or Chrome → install icon in the address bar (or menu → _Install Jot_).
- **iPhone:** open the site in Safari → **Share → Add to Home Screen**.

---

## Project structure

```
src/                React PWA
  components/ui/    shadcn/ui components (generated, not formatted)
  editor/           TipTap editor and its UI
  sync/             Yjs providers and persistence
  features/         notes, sharing
  lib/              shared helpers
worker/             Cloudflare Worker + NoteRoom Durable Object
docs/               Project context and per-task plans
```

Imports inside `src/` use the `@/` alias (`@/components/ui/button`), never `../`.

## Adding UI components

shadcn components are added only when a feature needs them:

```bash
pnpm dlx shadcn@latest add <component>
```

## Scripts

| Command           | What it does                                                  |
| ----------------- | ------------------------------------------------------------- |
| `pnpm dev`        | Run the app + Worker locally                                  |
| `pnpm build`      | Type-check and build for production                           |
| `pnpm preview`    | Build and preview the production bundle locally               |
| `pnpm deploy`     | Build and deploy to Cloudflare                                |
| `pnpm lint`       | Lint with oxlint                                              |
| `pnpm lint:fix`   | Lint and apply safe fixes                                     |
| `pnpm format`     | Check formatting (oxfmt), writes nothing                      |
| `pnpm format:fix` | Format all files                                              |
| `pnpm typecheck`  | Regenerate Worker types and run `tsc -b`                      |
| `pnpm check`      | Lint + format check + typecheck. Run before pushing or in CI  |
| `pnpm cf-typegen` | Regenerate `worker-configuration.d.ts` after editing wrangler |

A Husky pre-commit hook runs lint-staged: staged files are linted (`oxlint --fix`) and formatted (`oxfmt`). A lint error blocks the commit.

## Documentation

| File                                                 | Purpose                                             |
| ---------------------------------------------------- | --------------------------------------------------- |
| [`docs/project-context.md`](docs/project-context.md) | Architecture, decisions, data model, traps to avoid |
| [`docs/plans/`](docs/plans/)                         | One plan per feature, setup step or critical fix    |
| [`CLAUDE.md`](CLAUDE.md)                             | Working rules for AI coding agents                  |
