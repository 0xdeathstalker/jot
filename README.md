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
| UI      | React, Vite, TypeScript                                 |
| Editor  | TipTap (open source, headless)                          |
| Sync    | Yjs + `y-partyserver`                                   |
| Server  | Cloudflare Worker + Durable Objects (one per note)      |
| Storage | IndexedDB (client), Durable Object SQLite + D1 (server) |
| Hosting | Cloudflare, at `jot.deathstalker.dev`                   |

---

## Getting started

### Prerequisites

- Node.js 20+ and npm
- A free [Cloudflare account](https://dash.cloudflare.com/sign-up) (only needed to deploy)

### Install and run

```bash
git clone <repo-url> jot
cd jot
npm install
npm run dev
```

`npm run dev` starts Vite and a local simulation of the Cloudflare Worker and Durable Objects together. Nothing touches your Cloudflare account.

### Check that sync works

1. Open `http://localhost:5173/?note=test` in two browser tabs.
2. Type in one tab, and it should appear in the other.
3. Set one tab offline (DevTools → Network → Offline), edit in both, then go back online. Both edits should be kept.

---

## Deploy

```bash
npx wrangler login     # first time only
npm run deploy
```

This builds the app and deploys a single Worker that serves both the PWA and the sync server. It's live at `https://jot.<your-account>.workers.dev`.

### Custom domain (`jot.deathstalker.dev`)

1. Add `deathstalker.dev` to Cloudflare and switch its nameservers (free).
2. In the Cloudflare dashboard, go to **Workers & Pages → jot → Settings → Domains & Routes → Add custom domain**, and enter `jot.deathstalker.dev`.

## Install on devices

- **Windows:** open the site in Edge or Chrome → install icon in the address bar (or menu → _Install Jot_).
- **iPhone:** open the site in Safari → **Share → Add to Home Screen**.

---

## Project structure

```
src/        React PWA (editor, sync, features)
worker/     Cloudflare Worker + NoteRoom Durable Object
docs/       Project context and per-task plans
```

## Documentation

| File                                                 | Purpose                                             |
| ---------------------------------------------------- | --------------------------------------------------- |
| [`docs/project-context.md`](docs/project-context.md) | Architecture, decisions, data model, traps to avoid |
| [`docs/plans/`](docs/plans/)                         | One plan per feature, setup step or critical fix    |
| [`CLAUDE.md`](CLAUDE.md)                             | Working rules for AI coding agents                  |

## Scripts

| Command          | What it does                   |
| ---------------- | ------------------------------ |
| `npm run dev`    | Run the app + Worker locally   |
| `npm run build`  | Production build               |
| `npm run deploy` | Build and deploy to Cloudflare |

## Cost

₹0/month. Everything runs on Cloudflare's free plan, and hitting a limit causes temporary errors, never a bill. No paid TipTap packages are used.
