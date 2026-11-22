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
- **Windows desktop app**: a global hotkey brings Jot up over everything, Raycast-style; lives in the tray
- **Note switcher**: Ctrl+P / ⌘K jumps to any note by typing
- **Private**: sign in with Google; the server checks every connection, and only listed emails, or people holding an invite link, can sign up
- **Sharing**: send a link to share a note with up to 2 other people, as viewer or editor, with live cursors; send a join link to bring up to 3 friends into Jot (no email service needed)

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
| Desktop | Tauri v2 (Rust shell around the live site), Windows     |

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
cp .dev.vars.example .dev.vars   # then fill it in, see "One-time setup" below
pnpm db:migrate                  # creates the local auth tables
pnpm dev
```

`pnpm dev` starts Vite and a local simulation of the Cloudflare Worker, Durable Objects and D1 together. Nothing touches your Cloudflare account.

### One-time setup: Google sign-in

Jot logs in with Google, so you need your own OAuth client (free). Any Google account can create it; it does not have to be the account you use in Jot.

1. [Google Cloud Console](https://console.cloud.google.com): create a project, then **Google Auth Platform** (OAuth consent screen): user type **External**, leave it in **Testing**, and add the Google accounts that may use Jot under **Test users**.
2. **Clients → Create client → Web application**. Add the authorized redirect URI `http://localhost:5173/api/auth/callback/google`.
3. Fill in `.dev.vars` (gitignored):

   | Key                    | Value                                                                                                   |
   | ---------------------- | ------------------------------------------------------------------------------------------------------- |
   | `BETTER_AUTH_SECRET`   | 32+ random characters: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
   | `GOOGLE_CLIENT_ID`     | from the OAuth client                                                                                   |
   | `GOOGLE_CLIENT_SECRET` | from the OAuth client                                                                                   |
   | `ALLOWED_EMAILS`       | comma-separated emails allowed to sign up. **Empty means nobody**                                       |

4. Restart `pnpm dev` after changing `.dev.vars`, then open `http://localhost:5173` (use `localhost`, not `127.0.0.1`) and click **Continue with Google**.

`ALLOWED_EMAILS` lists the **original users**: they can sign up and make join links. Anyone else gets in only through a join link made by an original user (see "Sharing" below). To add an original user, add their email to `ALLOWED_EMAILS` (and under **Test users** while the consent screen is still in Testing).

**Going live:** for other people to sign in, move the consent screen to production: Google Auth Platform → Audience → **Publish app**. Basic sign-in (name, email, picture) needs no Google review, but the Branding page asks for a home page, privacy policy and terms link. Jot serves them at `/`, `/privacy` and `/terms` (static pages in `public/`), and `deathstalker.dev` (your own domain) must be listed under Authorized domains.

### Check that sync works

1. Sign in on `http://localhost:5173` in two different browsers (or a normal and a private window). Two tabs of one browser share storage and prove nothing.
2. Create a note in one; it should appear in the other, and typing should sync.
3. Stop `pnpm dev`, edit in both, start it again. Both edits should be kept.

---

## Deploy

First time only, with a free [Cloudflare account](https://dash.cloudflare.com/sign-up):

```bash
pnpm exec wrangler login
pnpm exec wrangler d1 create jot-db      # prints a database_id
```

Put that `database_id` in the `d1_databases` entry of `wrangler.jsonc` (keep the binding name `DB`; if wrangler offers to add its own binding, answer no). Then:

```bash
pnpm db:migrate:remote                   # creates the tables in the real database
pnpm exec wrangler secret put BETTER_AUTH_SECRET   # a NEW random value, not your local one
pnpm exec wrangler secret put GOOGLE_CLIENT_ID
pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
pnpm exec wrangler secret put ALLOWED_EMAILS
pnpm run deploy
```

`pnpm run deploy` (not `pnpm deploy`, which is a different built-in pnpm command) builds the app and deploys one Worker that serves the PWA, the sync server and the login endpoints. It prints `https://jot.<your-account>.workers.dev`. Add `https://jot.<your-account>.workers.dev/api/auth/callback/google` to the OAuth client's redirect URIs **before** signing in. Open the URL without a `www.`.

Later deploys are just `pnpm run deploy`; secrets stay in Cloudflare. If a change adds a file to `migrations/`, run `pnpm db:migrate:remote` first.

**Custom domain:** add `"routes": [{ "pattern": "jot.example.com", "custom_domain": true }]` to `wrangler.jsonc`, add the matching `/api/auth/callback/google` redirect URI, and deploy. The domain's DNS must be on Cloudflare, and the hostname must not already have its own DNS record (a wildcard record is fine).

## Sharing

Two kinds of link, sent through any chat app:

- **Invite a friend to Jot** (sidebar footer, original users only): one link, valid 7 days, lets up to 3 people sign up. Invited users are full users but cannot invite more people.
- **Share** (button above a note you own): choose **Can view** or **Can edit** and copy the link. A note holds you plus at most 2 other people. A share link never creates an account, so a new person needs a join link first. In the dialog you can raise or lower someone's access, remove them, or turn a link off. Anyone can **Leave note**; deleting a note you shared removes everyone's access.

Viewers are read-only on the server, not just in the editor. See [`docs/project-context.md`](docs/project-context.md#8-sharing-and-permissions-phase-6) for the rules.

## Install on devices

- **Windows:** open the site in Edge or Chrome → install icon in the address bar (or menu → _Install Jot_).
- **iPhone:** open the site in Safari → **Share → Add to Home Screen** (Jot shows a hint for this). Sign in again inside the installed app: iOS gives it its own cookies.

The app shell is cached, so an installed Jot opens with no network and updates itself silently on the next launch after a deploy. The service worker only exists in production builds: test it with `pnpm build && pnpm preview`, not `pnpm dev`.

### Windows desktop app

1. Download the latest `.exe` from [Releases](https://github.com/0xdeathstalker/jot/releases/latest) and run it.
2. Windows may say "Windows protected your PC" (the app is not code-signed): **More info → Run anyway**.
3. Sign in with Google once (the app keeps its own sign-in, separate from your browser).

Press **Ctrl+Alt+J** to show or hide it (change it in the gear menu → **Global hotkey…**). Closing the window keeps Jot in the tray; quit from the tray icon. It starts with Windows (untick **Launch at login** in the tray menu to stop that) and updates itself.

**Changing the icon:** replace `public/icon-source.svg` (and the rounded `public/favicon.svg`), run `pnpm pwa:icons`, commit the generated files in `public/`, deploy. For the desktop app also run `pnpm tauri icon public/icon-source.svg` and delete the generated `android/`, `ios/` and `64x64.png` in `src-tauri/icons/`. On iPhone, delete and re-add the Home Screen icon.

---

## Project structure

```
src/                React PWA
  components/ui/    shadcn/ui components (generated, not formatted)
  editor/           TipTap editor and its UI
  desktop/          desktop-only UI (title bar, hotkey dialog); the only place that imports @tauri-apps/*
  auth/             login screen, session gate, account footer
  sync/             Yjs providers, note-list store, local-data wipe
  features/         notes (list, search), sharing (share dialog, link pages, cursors)
  lib/              shared helpers
src-tauri/          Windows desktop shell (Rust): window, tray, global hotkey, updater
worker/             Cloudflare Worker, NoteRoom / IndexRoom Durable Objects, auth/ (Better Auth + permission checks), share.ts and join.ts (link APIs)
migrations/         D1 SQL (auth tables, note_members, invite links), append-only
docs/               Project context and per-task plans
```

Imports inside `src/` use the `@/` alias (`@/components/ui/button`), never `../`.

## Adding UI components

shadcn components are added only when a feature needs them:

```bash
pnpm dlx shadcn@latest add <component>
```

## Scripts

| Command                  | What it does                                                  |
| ------------------------ | ------------------------------------------------------------- |
| `pnpm dev`               | Run the app + Worker locally                                  |
| `pnpm build`             | Type-check and build for production                           |
| `pnpm preview`           | Build and preview the production bundle locally               |
| `pnpm run deploy`        | Build and deploy to Cloudflare                                |
| `pnpm lint`              | Lint with oxlint                                              |
| `pnpm lint:fix`          | Lint and apply safe fixes                                     |
| `pnpm format`            | Check formatting (oxfmt), writes nothing                      |
| `pnpm format:fix`        | Format all files                                              |
| `pnpm typecheck`         | Regenerate Worker types and run `tsc -b`                      |
| `pnpm check`             | Lint + format check + typecheck. Run before pushing or in CI  |
| `pnpm cf-typegen`        | Regenerate `worker-configuration.d.ts` after editing wrangler |
| `pnpm pwa:icons`         | Regenerate PWA icons from `public/icon-source.svg`            |
| `pnpm db:migrate`        | Apply `migrations/` to the local D1 database                  |
| `pnpm db:migrate:remote` | Apply `migrations/` to the real D1 database                   |
| `pnpm desktop:dev`       | Desktop app against `pnpm dev` (needs Rust)                   |
| `pnpm desktop:build`     | Build the desktop installer locally (needs the updater key)   |

A Husky pre-commit hook runs lint-staged: staged files are linted (`oxlint --fix`) and formatted (`oxfmt`). A lint error blocks the commit.

## Desktop releases

Only the shell (`src-tauri/`) is released; the UI comes from the live site, so a normal deploy updates the desktop app too.

1. Bump `version` in `src-tauri/tauri.conf.json` and commit.
2. `git tag desktop-v<version>` and `git push origin desktop-v<version>`.
3. `.github/workflows/desktop-release.yml` builds the installer and publishes the release; installed apps update within 6 hours.

Needs the `TAURI_SIGNING_PRIVATE_KEY` repo secret (the updater key, kept outside the repo and backed up). A change that needs a new shell command: release the shell before deploying the site.

## Documentation

| File                                                 | Purpose                                             |
| ---------------------------------------------------- | --------------------------------------------------- |
| [`docs/project-context.md`](docs/project-context.md) | Architecture, decisions, data model, traps to avoid |
| [`docs/plans/`](docs/plans/)                         | One plan per feature, setup step or critical fix    |
| [`CLAUDE.md`](CLAUDE.md)                             | Working rules for AI coding agents                  |
