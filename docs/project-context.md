# Jot: Project Context

> A Raycast Notes–style app that syncs notes across devices (Windows, iPhone) within about a second.
> This file is the single source of truth for the "what" and "why" of Jot.
> Read it fully before writing code. Update it when a decision changes.
>
> **Where things live:**
>
> - `CLAUDE.md`: short working rules for AI agents (auto-loaded)
> - `README.md`: setup, run and deploy, for humans
> - `docs/project-context.md`: this file (architecture, decisions, traps)
> - `docs/design.md`: design brief (aim, feel, colour rules, palettes tried)
> - `docs/plans/`: one plan per task (setup, features, critical fixes)

---

## 1. Goal

Build a lightweight notes app that:

- **Feels instant.** Typing never waits on the network.
- **Syncs quickly.** An edit on one device shows up on the others within about a second.
- **Works offline.** Edits made offline merge automatically when the device reconnects.
- **Runs on Windows and iPhone** as one installable **PWA**, with no app stores. On Windows also a
  small desktop app (Tauri) that a global hotkey brings up; it loads the same site.
- **Costs ₹0/month to run**, using free Cloudflare services only.
- **Allows sharing later.** A note can be shared with a few known people, who can edit it together live.

### Non-goals (for now)

- Native apps (Electron, Swift). The one exception: the Windows desktop app, a thin Tauri shell around the live site (`docs/plans/desktop-app.md`).
- Large teams, workspaces or enterprise features.
- AI features, comments and version history in v1. These can come later, built by us (see Traps).
- Public sharing links that anyone can view.

---

## 2. Decisions (settled)

| Decision        | Choice                                                            | Why                                                                                                                                                                                                   |
| --------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name            | **Jot**                                                           |                                                                                                                                                                                                       |
| App type        | PWA (one React codebase for every device)                         | No app stores, instant updates                                                                                                                                                                        |
| UI              | React + Vite + TypeScript                                         | Owner's strength                                                                                                                                                                                      |
| Editor          | TipTap, **open-source packages only**                             | Headless: we build our own UI                                                                                                                                                                         |
| Sync model      | Yjs (CRDT)                                                        | Offline edits merge automatically                                                                                                                                                                     |
| Sync server     | **Cloudflare Durable Objects + `y-partyserver`**                  | Free, nothing to maintain, nothing sleeps                                                                                                                                                             |
| Hosting shape   | **One Cloudflare Worker serves both the PWA and the sync server** | One origin, no CORS, one deploy                                                                                                                                                                       |
| Domain          | `jot.deathstalker.dev`                                            | Subdomain of an existing domain, so no extra cost                                                                                                                                                     |
| Scaffold        | `pnpm create cloudflare` (React framework)                        | Simplest to learn. Better-T-Stack skipped (see §10).                                                                                                                                                  |
| Package manager | **pnpm**                                                          | Enforced by a `preinstall` guard. Lockfile is `pnpm-lock.yaml`.                                                                                                                                       |
| UI kit          | **Tailwind CSS v4 + shadcn/ui**                                   | Components are copied into `app/src/components/ui/`, so we own them. Add one only when a feature needs it.                                                                                            |
| Lint / format   | **oxlint + oxfmt**, Husky + lint-staged pre-commit                | Fast, one config each. A lint error blocks the commit.                                                                                                                                                |
| Desktop app     | **Tauri v2 shell loading the live site** (Windows)                | Global hotkey, tray, always on top. Same origin as the web app, so auth, sockets and offline work unchanged and a web deploy updates it. Only the shell ships as an installer (GitHub Releases)       |
| Auth            | **Google OAuth via Better Auth + D1**, session cookie (no JWT)    | Free, runs in the Worker. Same origin, so the browser sends the cookie on the WebSocket upgrade and the Worker checks it. Access is limited to an `ALLOWED_EMAILS` allowlist plus Google Testing mode |

Rejected alternatives: Hocuspocus (needs a paid always-on Node server or a flaky free VM), Render's free tier (sleeps, wipes files), Tiptap Cloud (paid).

---

## 3. Cloudflare in 2 minutes

- **Worker:** a small serverless function that runs on Cloudflare's network. Ours is `worker/src/index.ts`. It handles every request to `jot.deathstalker.dev`.
- **Static assets:** the built React app (`dist/`) is served by the same Worker. Unknown routes fall back to `index.html` (SPA mode).
- **Durable Object (DO):** a tiny server with its own memory and its own private **SQLite** database. We create **one DO per note** (a "room"). Every device editing that note connects to the same DO over a WebSocket.
- **Hibernation:** a DO can sleep while its WebSockets stay open, and it wakes on the next message. Idle time is free. **Always on for Jot.**
- **D1:** Cloudflare's serverless SQLite database. We use it for app-wide data (users, sharing), not note content.
- **Wrangler:** Cloudflare's CLI. `wrangler.jsonc` is the config, declaring the DO bindings, migrations and assets.
- **`@cloudflare/vite-plugin`:** runs the Worker and the React app together in `pnpm dev`, using a local simulation of Cloudflare.
- **Free plan behaviour:** exceeding a daily limit makes requests **fail until 00:00 UTC**. It never produces a surprise bill.

---

## 4. Architecture

```
 ┌──────────── Windows PWA ────────────┐   ┌──────────── iPhone PWA ─────────────┐
 │ UI:      React + TipTap             │   │ UI:      same React app              │
 │ Sync:    Y.Doc + YProvider          │   │ Sync:    Y.Doc + YProvider           │
 │ Storage: IndexedDB + service worker │   │ Storage: IndexedDB + service worker  │
 └──────────────────┬──────────────────┘   └──────────────────┬───────────────────┘
                    │  WebSocket (small binary Yjs updates)    │
                    └──────────────────┬───────────────────────┘
                                       ▼
          ┌────────── Cloudflare Worker (jot.deathstalker.dev) ──────────┐
          │ Static assets: the React PWA                                  │
          │ Router: checks session cookie → routes /parties/... to a DO room  │
          │ NoteRoom DO (one per note): relays updates, stores Yjs state  │
          │ D1: auth tables, note_members                                 │
          └───────────────────────────────────────────────────────────────┘
```

### What happens when you type

1. TipTap applies the edit to the note's **Y.Doc**, and the UI updates immediately.
2. `y-indexeddb` saves the change locally.
3. `YProvider` sends a small binary update over the WebSocket.
4. That note's Durable Object stores it (debounced) and broadcasts it to other connected devices.
5. Other devices merge it. If a device was offline, it gets only the changes it missed when it reconnects.

### Key idea: local-first

The app **always reads and writes locally first**. The server is a relay and a backup, never a blocker.
**Never show a spinner while saving.**

---

## 5. Repository layout

```
jot/
├── CLAUDE.md                 ← agent rules (short, auto-loaded)
├── README.md                 ← setup, run, deploy
├── docs/
│   ├── project-context.md    ← this file
│   └── plans/                ← <topic>.md, one per task
├── index.html                ← Vite entry (stays at the Vite root, loads /app/src/main.tsx)
├── vite.config.ts            ← includes the PWA plugin (manifest, Workbox); publicDir app/public
├── wrangler.jsonc            ← Worker, DO bindings, assets (next to vite.config.ts: one build, one deploy)
├── tsconfig.json             ← references app/, worker/, tsconfig.node.json
├── .oxlintrc.json            ← lint rules
├── .oxfmtrc.json             ← formatter rules
├── .github/workflows/        ← deploy.yml, desktop-release.yml (a desktop-v* tag builds the installer)
├── app/                      ← client (React PWA)
│   ├── components.json       ← shadcn/ui config (aliases use @/*; the CLI now refuses `-c app`: see README "Adding UI components")
│   ├── pwa-assets.config.ts  ← icon generation (`pnpm pwa:icons`)
│   ├── tsconfig.json
│   ├── public/               ← icons, fonts, and the static /privacy and /terms pages
│   └── src/
│       ├── main.tsx          ← registers the service worker (phase 5)
│       ├── app.tsx
│       ├── styles/index.css  ← Tailwind + shadcn theme variables
│       ├── components/ui/    ← shadcn/ui components (generated, add on demand)
│       ├── editor/           ← TipTap editor + our own toolbar/UI
│       ├── desktop/          ← the ONLY place that imports @tauri-apps/* (lazy, desktop only)
│       ├── hooks/            ← React hooks, one per file (`use-*.ts`)
│       │   └── use-theme.ts  ← dark/light; same rule as the inline script in index.html
│       ├── sync/
│       │   ├── provider.ts   ← the ONLY module that imports y-partyserver
│       │   └── index-doc.ts  ← per-user note list (phase 3)
│       ├── features/
│       │   ├── notes/        ← top bar, switcher, Action Panel, search
│       │   └── sharing/      ← share dialog, /share and /join pages, API client, cursors (phase 6)
│       └── lib/              ← utils (cn), shared helpers
├── shared/api.ts             ← share/join API types for client and Worker (`@shared/*`, types only)
├── worker/                   ← server
│   ├── tsconfig.json
│   ├── worker-configuration.d.ts ← generated by `pnpm cf-typegen`
│   ├── migrations/           ← D1 SQL, append-only
│   └── src/
│       ├── index.ts          ← entry: auth, share/join APIs, then routePartykitRequest
│       ├── share.ts, join.ts ← REST: share links and members, "join Jot" links (phase 6)
│       ├── http.ts           ← JSON helpers, link tokens, Origin check
│       ├── rooms/            ← NoteRoom / IndexRoom (YServer Durable Objects), kick.ts
│       └── auth/             ← Better Auth, allowlist, invites (join links), gate.ts (room guard)
└── tauri/                    ← Windows desktop shell (Rust): window, tray, hotkey, updater
    ├── src/lib.rs            ← all shell code
    ├── tauri.conf.json       ← app id, version (release tag must match), updater key
    └── capabilities/         ← what the live site may call (keep it harmless)
```

---

## 6. Dependencies (add them only when their phase starts)

| Package                                                                                                | Phase         | Purpose                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tailwindcss`, `@tailwindcss/vite`, shadcn/ui deps (`class-variance-authority`, `tw-animate-css`, ...) | 0             | Styling + UI kit. Installed by `shadcn init`.                                                                                                                             |
| `oxlint`, `oxfmt`, `husky`, `lint-staged`                                                              | 0             | Lint, format, pre-commit                                                                                                                                                  |
| `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`                                                   | 1             | Editor                                                                                                                                                                    |
| `@tiptap/extension-collaboration`                                                                      | 1             | Binds the editor to Yjs. Install any peer dependency pnpm asks for.                                                                                                       |
| `yjs`                                                                                                  | 1             | CRDT                                                                                                                                                                      |
| `partyserver`, `y-partyserver`                                                                         | 1             | Durable Object server + client `YProvider`                                                                                                                                |
| `y-indexeddb`                                                                                          | 2             | Local persistence / offline                                                                                                                                               |
| `minisearch`                                                                                           | 3             | Local search                                                                                                                                                              |
| `better-auth`                                                                                          | 4             | Google login + sessions, with D1 as its database. Needs the `nodejs_compat` flag.                                                                                         |
| `vite-plugin-pwa`                                                                                      | 5             | Manifest + service worker. **Not earlier**, since caching confuses dev.                                                                                                   |
| `@vite-pwa/assets-generator` (dev)                                                                     | 5             | `pnpm pwa:icons`: makes every icon size from `app/public/icon-source.svg`.                                                                                                |
| `@tiptap/extension-collaboration-caret`                                                                | 6             | Other people's cursors                                                                                                                                                    |
| `@tiptap/extension-list`, `@tiptap/extension-image`, `@tiptap/markdown`                                | editor blocks | Checklists, images inside the note, Markdown paste (`docs/plans/editor-blocks.md`). Keep every `@tiptap/*` package on the same version: they peer on exact `@tiptap/core` |

| `@tauri-apps/cli` (dev), `@tauri-apps/api` | desktop | Desktop shell (`docs/plans/desktop-app.md`). The Rust side adds Tauri plugins in `tauri/Cargo.toml`: global-shortcut, single-instance, autostart, window-state, updater |

Don't add: `nanoid` (use `crypto.randomUUID()`), any `@tiptap-pro/*` package, or Hocuspocus packages.

### About TipTap's UI

TipTap is **headless**: there's no UI out of the box. Toolbars, menus and styling are our own React components, and content is styled with CSS on `.ProseMirror`. TipTap's open-source **Simple Editor template** may be used as a starting point (its CLI copies the code into our repo, so we own it). The **Notion-like template and Pro components are paid. Don't use them.**

---

## 7. Data model

### Client-side (Yjs)

- **One Y.Doc per note.** Room name: plain `<noteId>` (URL `/parties/note-room/<noteId>`). Holds the rich text (a `Y.XmlFragment` bound to TipTap).
- **One "index" Y.Doc per user.** Party `index-room` (class `IndexRoom`, migration `v2`), room `index-<userId>`, IndexedDB `jot-index-<userId>`. A `Y.Map` named `notes`, one nested `Y.Map` per note (so concurrent edits to different fields both survive):
  ```ts
  { [noteId]: { title: string, preview: string, chars?: number, createdAt: number, updatedAt: number, pinned: boolean, deleted: boolean,
                role?: 'editor' | 'viewer', shared?: boolean, noAccess?: boolean } }
  ```
  The last three are Phase 6 UI hints, never permissions: `role` is set when someone else owns the note, `shared` when you own it and made a share link, `noAccess` when its owner removed you (learned from the server). D1 `note_members` is the truth.
  The title is the first line of the note, the preview its next ~200 characters (search only; the list shows the title, then "Edited … / Current • N characters" from `chars`, the note's length without line breaks), all written by the editor on local edits only (so there is no separate rename action). Search is MiniSearch over title + preview. The Phase 3 placeholder room `index-default` is gone from the server; the first user to sign in on a device merges that device's old local list into their own index (`app/src/sync/legacy-index.ts`).
- IDs are generated on the client with `crypto.randomUUID()`, so notes can be created offline.
- **Drafts:** New note writes nothing to the index. The note is a draft (its id in React state and `sessionStorage` `jot-draft`, this tab only) until the first local edit that leaves it non-blank (anything but one empty paragraph); then `createNote(doc, id)` lists it. Leaving an untouched draft deletes its empty IndexedDB copy. Only a note made by New note on this device is ever a draft, so a listed note can never be re-created over its pin or sharing marks (`createNote` also never overwrites an entry). Plan: `docs/plans/blank-notes.md`.

### Server-side

- **Note content:** each NoteRoom DO stores the compacted Yjs state (`Y.encodeStateAsUpdate`) in its own SQLite storage.
- **D1 (`jot-db`, binding `DB`, SQL in `worker/migrations/`, applied with `pnpm db:migrate` / `db:migrate:remote`):**
  ```sql
  -- 0001, Phase 4: generated by Better Auth: user, session, account, verification
  -- 0002, Phase 4:
  note_members (note_id, user_id, role, created_at)   -- role: 'owner' | 'editor' | 'viewer'
  -- 0003, Phase 6 (tokens are 32 random bytes, base64url):
  note_invites  (token, note_id, role, created_by, created_at, expires_at, revoked_at)  -- share links; role: 'editor' | 'viewer'; one live link per note and role
  user_invites  (token, created_by, created_at, expires_at, revoked_at)                 -- "join Jot" links; one live link per original user
  invited_users (user_id, invited_by, created_at)                                       -- who joined through whom; the row count per inviter is the limit
  ```
  `note_members` has a unique index allowing one owner per note. The first signed-in user to open a note id claims it as owner (ids are random UUIDs, so this works for notes created offline).

---

## 8. Sharing and permissions (phase 6)

There are two kinds of link, both plain URLs with an unguessable token that the owner sends through any chat app (no email service, nothing paid):

- **Join link** (`/join/<token>`): makes a stranger a Jot user. Only "original users" (emails on `ALLOWED_EMAILS`) have one: a single permanent link each, made by the server the first time they open Invites (no create, no expiry, no turn-off; the same URL for everyone they invite). It admits at most **3 people** in total, checked on every join, so a link that spreads further admits nobody once the places are used (`JOIN_LIMIT` in `worker/src/auth/invites.ts`). Invited users are full users (they can create and share notes) but cannot make join links, so the total stays bounded. The login screen leaves the token in a short-lived cookie (`jot-invite`) for the Google round trip; the sign-up hook in `worker/src/auth/auth.ts` reads it.
- **Share link** (`/share/<token>`): gives an existing user access to one note, as **editor** or **viewer**. Each note has one permanent view link and one permanent edit link, made by the server the first time the owner opens Share (no create, no expiry, no turn-off). Removing someone gives the note two new links, so the freed place cannot be retaken with the old URL; people still on the note keep their access. The list marks a note "Shared" once someone besides the owner has joined. It never creates an account: someone with no Jot account is told to ask for a join link first. A note holds the owner plus at most **2 other people** (`NOTE_LIMIT` in `worker/src/share.ts`). A second link can only raise a role.

Rules:

- **Active user** = email on `ALLOWED_EMAILS`, or a row in `invited_users`. Sharing access alone never makes anyone active. Every room and API route requires it, and it is re-checked on every connection, so removing an email takes effect.
- **Every WebSocket connection is checked in the Worker** (`worker/src/auth/gate.ts`: session cookie, active user, `note_members`, Origin) before routing to the room. The guard overwrites `x-jot-role` and `x-jot-user` on the request; the room turns them into connection tags (`role:<r>`, `user:<id>`).
- **Viewers are read-only on the server.** `NoteRoom.isReadOnly` drops their document updates (a connection without a role tag is read-only too). The editor also turns read-only for viewers, but only so the screen matches.
- **A connection keeps the role it was opened with.** Changing a role (owner's selector, or a second link raising it) closes that person's open connections with code **4401**, and the provider reconnects with the new role. **4403** means removed: the client shows "no longer have access", stops reconnecting, and offers to delete the local copy.
- **The owner manages people** in the Share dialog: raise or lower a role (`PATCH`), remove someone, turn a link off. Anyone can **leave** a note. The owner deleting a shared note removes everyone's access first (the data stays: soft delete only).
- **API** (`/api/share/...`, `/api/join/...`, all JSON, session required, `Origin` must match on writes): see the route list at the top of `worker/src/share.ts` and `worker/src/join.ts`.
- **"Shared with me":** the accepted note is written into the recipient's own index doc (`role`). On startup and when a socket closes with 4401, the app reads `GET /api/share/mine` and corrects roles or marks removed notes `noAccess`.
- **Live cursors and names** come from Yjs awareness + `CollaborationCaret` (name from the Google profile, colour from a hash of the user id). They live in memory only and disappear when the socket closes.
- **Revoking access:** delete the row and close that user's connections. ⚠️ They keep whatever is already in their IndexedDB. That's inherent to local-first, so accept it.
- **Google consent screen** is In production (a free "publish", no Google review for basic scopes), so the invite is the gate. Its privacy and terms pages are static files in `app/public/`.

---

## 9. Hosting and costs

| Item              | Where                                                             | Cost                                   |
| ----------------- | ----------------------------------------------------------------- | -------------------------------------- |
| PWA + sync server | One Cloudflare Worker (free plan) + SQLite-backed Durable Objects | Free                                   |
| DB                | DO SQLite + D1                                                    | Free (5 GB account total, 1 GB per DO) |
| Auth              | Inside the Worker                                                 | Free                                   |
| Email (not used)  | Invites are links, not emails (Phase 6)                           | Nothing to pay for                     |
| Domain            | `jot.deathstalker.dev`                                            | Already owned                          |

**Expected monthly cost: ₹0.** A custom subdomain on a Worker requires `deathstalker.dev`'s DNS to be on Cloudflare (moving nameservers is free). Until then, use the free `jot.<account>.workers.dev` URL.

---

## 10. Build plan (do these in order; each phase gets a plan in `docs/plans/`)

### Phase 0: Setup

- [x] Scaffold with `pnpm create cloudflare@latest` (React, TypeScript)
- [x] Create the `worker/` and `src/` layout from §5
- [x] Add `CLAUDE.md`, `README.md` and `docs/`
- [x] Configure `wrangler.jsonc`: NoteRoom binding, `new_sqlite_classes` migration, SPA assets
- [x] Tailwind v4, `@/*` path alias, shadcn/ui init (no components pre-installed)
- [x] oxlint + oxfmt + Husky/lint-staged pre-commit

### Phase 1: Prove sync works ⚠️ the riskiest part

- [x] TipTap editor bound to a Y.Doc (disable StarterKit's undo/redo)
- [x] NoteRoom DO (`YServer`) with hibernation on
- [x] Two browser tabs on `?note=test` stay in sync

### Phase 2: Offline and persistence

- [x] `y-indexeddb` on the client (database `jot-note-<noteId>`, created in the `useNoteSession` effect; the name is fixed because renaming orphans users' offline data)
- [x] `onLoad` / `onSave` in NoteRoom, writing to DO storage (`ctx.storage.kv`, key `doc`, compacted Yjs update; move to a SQL table only if a room needs more than one blob)
- [x] Test: edit offline in both tabs → reconnect → both edits are kept

### Phase 3: Notes list

- [x] Per-user index doc (create, pin, soft delete; "rename" = edit the first line)
- [x] Sidebar + MiniSearch (title + preview). Navigation stays `?note=<id>` via `history.pushState`, no router

### Phase 4: Auth and deploy

- [x] Login with Google (Better Auth + D1), session cookie instead of a JWT. Only emails in `ALLOWED_EMAILS`, or people holding a valid join link (Phase 6), can sign up; sign-out syncs, then clears this account's local data from the device (other accounts' stay, `docs/plans/note-list-sync.md` task 6)
- [x] The Worker checks the session and note ownership before connecting (`onBeforeConnect`/`onBeforeRequest`, Origin check, `index-<userId>` only). `run_worker_first` covers `/api/*` and `/parties/*`
- [x] Deployed on `jot.<account>.workers.dev` and the custom domain `jot.deathstalker.dev` (its DNS was already on Cloudflare), via `pnpm run deploy`

### Phase 5: PWA polish

- [x] `vite-plugin-pwa`: manifest (`display: standalone`, icons, `theme-color`), app-shell caching, silent auto-update. Icons from `pnpm pwa:icons`
- [x] iOS fixes (see Traps) and a first-visit "Add to Home Screen" hint (iPhone Safari only)

### Phase 6: Sharing

- [x] D1 `note_invites` / `user_invites` / `invited_users`, share dialog, share links and "join Jot" links (link only: no email service)
- [x] Server-side read-only for viewers, role changes, remove / leave / unshare-on-delete, live cursors, "Shared with me"
- [x] Google consent screen In production; static `/privacy` and `/terms` pages

### Action Panel and editor chrome (`docs/plans/action-panel.md`)

- [x] Action Panel (Ctrl/⌘+K): every action with its keys; one action list feeds the panel and the shortcuts
- [x] Recently Deleted with Restore, and Delete All Notes (soft delete; shared notes kept)
- [x] Shared top bar on every platform, sidebar removed; phone: New note and a ⋮ menu
- [x] Editor chrome (phases 6–13): smaller toolbar, toolbar in the web top bar, hide toolbar, close keyboard, scroll fade, toasts, H2 first line on new phone notes, tooltips with keys, shadcn-style checkboxes

### Later (optional)

- [ ] Version history (our own Yjs snapshots)
- [ ] Comments (a `Y.Map` inside the note doc)
- [x] Windows desktop app (Tauri): `docs/plans/desktop-app.md`
- [ ] Editor blocks ([issue #1](https://github.com/0xdeathstalker/jot/issues/1), `docs/plans/editor-blocks.md`): checklists, Raycast-style toolbar, link box, images inside the note, Markdown paste (copy/download removed 2026-11-15). Built; browser checks pending

---

## 11. Traps to avoid

### Money traps

- ❌ **Never install `@tiptap-pro/*` or use Tiptap Cloud / paid templates.** Build history and comments ourselves.
- ❌ Don't move hosting to Vercel's free plan (non-commercial only) or Render's free tier (sleeps, wipes files).
- ✅ NoteRoom **must use hibernation** so idle sockets don't consume the free quota.

### Data and sync traps

- ❌ **Never hard-delete notes.** Use `deleted: true`, or an offline device can resurrect them.
- ⚠️ A delete only marks the list entry (`deleted: true`); other windows still have that note open. The open note watches its own entry (`useNoteDeleted`) and leaves when it is deleted. Treat a missing entry as not deleted: drafts and unsynced notes are not in the list (`docs/plans/deleted-note-elsewhere.md`).
- ❌ Don't store note content outside Yjs. There must be one source of truth.
- ❌ Don't put every note in one giant Y.Doc. Use one per note + one index doc per user.
- ❌ Don't trust the client for permissions. Check every connection in the Worker.
- ❌ Don't enable TipTap's normal undo/redo alongside Collaboration. They conflict.
- ⚠️ Save compacted state (`Y.encodeStateAsUpdate`), not an ever-growing list of updates.
- ❌ Don't copy a role or user id from a client header: `guardRoom` always overwrites `x-jot-role` / `x-jot-user`.
- ❌ **A room without `x-jot-role` is read-only and saves nothing**, yet the client still reports "synced". Every room class `guardRoom` passes on (`IndexRoom` too: it extends `NoteRoom`) must get both headers (`withIdentity`). Missing on `IndexRoom` from 2026-11-11 to 2026-11-23 lost note lists (`docs/plans/note-list-sync.md`).
- ⚠️ Sign-out syncs and then deletes only the signed-out account's own data: its list and the notes in it (`requestWipe(userId)`, deleted on the next page load). Other `jot-*` databases in the browser (another account whose session ended without signing out) are left alone: syncing them is refused, and wiping them could lose that account's offline edits. They stay readable in DevTools until that account signs out (accepted, owner 2026-11-23).
- ⚠️ A WebSocket keeps the role it was opened with: after any role change, close the person's connections (4401), don't just update the row.
- ⚠️ Link tokens are passwords: never log them, and drop them from the address bar once used.
- ❌ **An older app version deletes blocks it does not know.** `y-tiptap` removes shared content its schema cannot show, for everyone. Keep `enableContentCheck` on (it stops sync and shows "Reload to update" instead), ship new node types together, and never rename a node type or attribute that notes already use.
- ⚠️ **Images live inside the note** (base64 in the Y.Doc). Keep the 4 MB note cap (`MAX_NOTE_BYTES`) and 300 KB per image: the server saves a note as one SQLite row (8 MB max), and a save that fails is lost on the server side.

### Desktop app traps

- ⚠️ The live site can call the shell's commands (`tauri/capabilities/`): an XSS on the site reaches whatever they expose. Only harmless commands (window, hotkey); never file system or shell access.
- ❌ Don't import `@tauri-apps/*` outside `app/src/desktop/` (lint error): the web and phone bundles must not change.
- ⚠️ The installed shell can be older than the site. A feature that needs a new shell command: release the shell first, deploy the web part after, and let the site cope if the command is missing.
- ⚠️ Hiding the window does not make the page "hidden" (WebView2): `visibilitychange` never fires on hide or show. Use window `focus` for "user came back" (the shell focuses the window on every show).
- ⚠️ The window stays open for days: a deploy can delete a lazy chunk it still needs. Load lazy parts with `lazyOrReload` (`app/src/lib/lazy.ts`).
- ❌ Never lose or commit the updater key (`%USERPROFILE%.taurijot-updater.key`, repo secret `TAURI_SIGNING_PRIVATE_KEY`). Without it installed apps can never update.
- ⚠️ The updater reads the repo's _latest_ GitHub Release: every release in this repo must be a desktop release.
- The release tag (`desktop-v0.2.0`) must match `version` in `tauri/tauri.conf.json`.

### iOS / PWA traps

- No background sync: reconnect the provider on `visibilitychange`.
- iOS can evict IndexedDB for unused apps. The server must always hold the full copy.
- Inputs need **≥ 16px** font, or Safari zooms in.
- Use `viewport-fit=cover` + `env(safe-area-inset-*)`, and set `overscroll-behavior: none`.
- There's no share-target API and no install prompt on iOS, so show your own install hint.

### Cloudflare traps

- On the free plan, DO classes **must** be declared under `new_sqlite_classes` in migrations.
- Changing or renaming a DO class requires a **new migration entry**. Never edit an old one.
- The DO binding name maps to a kebab-case party name on the client (`NoteRoom` → `note-room`).
- DOs have per-request CPU limits, so don't run heavy work on the server.
- y-partyserver is young: when stuck, read its source and examples in GitHub `cloudflare/partykit`.
- A Windows PWA can't register a global hotkey. The Tauri desktop app does it.
- Plain `wrangler dev` makes the Worker see the custom-domain route (`http://jot.deathstalker.dev`) as its origin, so Better Auth sends Google that redirect URI and Google login fails ("Access blocked: this app's request is invalid"). Use `pnpm preview:worker` (passes `--local-upstream localhost:8787`), open `http://localhost:8787` (not `127.0.0.1`), and keep `http://localhost:8787/api/auth/callback/google` in the Google client's redirect URIs.

---

## 12. Open decisions

| Decision                         | Status      | Notes                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Usage limits before going public | Not decided | Caps on accounts, notes per user and note size, per-user rate limits. Partly covered by Phase 6: 3 invited people per original user, invited users cannot invite, 2 other people per note. No cap yet on notes per user or note size                                                                                                                           |
| Sharing by email                 | Decided: no | Link only (a join link, a share link). No email service, so nothing paid. Can be added later without changing the tables                                                                                                                                                                                                                                       |
| Who can invite                   | Decided     | Only original users (`ALLOWED_EMAILS`) have a join link: one permanent link each, 3 people each (owner, 2026-11-15). Only a note's owner makes share links and manages people                                                                                                                                                                                  |
| Share links                      | Decided     | Permanent, one per note and role, new URLs when the owner removes someone (owner, 2026-11-16); they never create accounts. The owner deleting a shared note removes everyone's access                                                                                                                                                                          |
| Image storage                    | Decided     | Inside the note: shrunk on the device (1280 px, WebP or JPEG, max 300 KB), max 4 MB per note. Free, offline, no new service. Server uploads (R2) only if notes become image-heavy                                                                                                                                                                              |
| Markdown                         | Decided     | Paste only (owner, 2026-11-15: the toolbar `…` menu with copy / download as `.md` is removed). Paste Markdown (plain text, or a VS Code copy of a Markdown/MDX file) as formatted text. No `.md` file import                                                                                                                                                   |
| Code blocks                      | Decided     | Plain code block, no language picker or highlighting                                                                                                                                                                                                                                                                                                           |
| Blank notes (issue #2)           | Decided     | New note is a draft until its first real edit, never synced while blank. Not a `blank` flag plus cleanup (reverted). An old draft id reopened by URL after leaving it stays unlisted even if typed into (rare, accepted). Blank notes made before the fix: delete by hand                                                                                      |
| Colour theme                     | Decided     | Warm "paper and ink" palette, one ink-blue accent; crimson only for delete/remove/sign out (`docs/plans/project-theme.md`). Moon/sun Mode switch in the account gear menu, saved per device; follows the system until first picked, with no way back to "system" (owner, 2026-11-18)                                                                           |
| Phone sidebar edge swipe         | Superseded  | Swipe from the left edge opens the sidebar on phones, iOS-style. Base UI `Drawer` + `SwipeArea` (already installed) replaces the Sheet (`docs/plans/sidebar-edge-swipe.md`). In Safari, outside the installed app, the edge swipe means Back and Safari keeps it (2026-11-21). Superseded 2026-11-28: the sidebar is gone (see "Sidebar and top bar")          |
| Windows desktop app              | Decided     | Tauri v2 shell loading the live site; global user-set hotkey, one always-on-top window, tray only, close hides to tray; friends too, unsigned for now (owner, 2026-11-21). Spike done 2026-11-22: Google login works in WebView2. Note switcher Ctrl/⌘+P, Action Panel Ctrl/⌘+K, on every platform (`docs/plans/desktop-app.md`, `docs/plans/action-panel.md`) |
| Repository layout                | Decided     | No monorepo (one deployable). Folders `app/`, `worker/`, `shared/` (types only), `tauri/` (was `src-tauri/`); one `package.json`, root `vite.config.ts` + `wrangler.jsonc` (owner, 2026-11-22, `docs/plans/repo-layout.md`). Workspaces only if a second deployable appears                                                                                    |
| What sign-out deletes            | Decided     | Only the signed-out account's own data (its list and the notes in it). Another account's data left in the browser stays until it comes back or signs out: no silent loss of its offline edits, at the cost of a browser that is not empty after sign-out (owner, 2026-11-23, `docs/plans/note-list-sync.md`)                                                   |
| Command palette (⌘K / Ctrl+K)    | Decided     | The Raycast-style Action Panel (owner, 2026-11-27): Ctrl/⌘+K opens a searchable list of every action with its keys (New, Pin, Share, Browse Notes Ctrl/⌘+P, Back / Forward, Recently Deleted, Delete Ctrl/⌘+D, Delete All Ctrl/⌘+Alt+D). One action list feeds the panel and the shortcuts (`docs/plans/action-panel.md`). The link box uses Ctrl/⌘+L          |
| Sidebar and top bar              | Decided     | Sidebar removed (owner, 2026-11-28): one shared top bar on web, phone and desktop (`features/notes/top-bar.tsx`) with Actions, New note and Search; notes are reached through the switcher. Web puts the formatting toolbar in the bar; phone has New note and a ⋮ menu. Replaces the phone sidebar edge swipe                                                 |

---

## 13. Rules for agents (the short version also lives in `CLAUDE.md`)

1. Read this file first. If a change contradicts it, raise that instead of silently diverging.
2. Before starting a feature or fix, check `docs/plans/` and create a plan if none exists.
3. Local-first always: the UI reads and writes the local Y.Doc, never a server API, for note data.
4. Free tools only. Flag any paid service or package.
5. All sync-provider code goes through `app/src/sync/provider.ts`.
6. After any sync, storage or editor change, test with two tabs (one offline).
7. Keep it small, with few dependencies. Add packages only when their phase starts (§6).
8. Update the §10 checkboxes and §12 decisions when something is done or decided.

---

## 14. Glossary

- **PWA:** a website that installs and opens like an app, works offline, and has its own icon.
- **CRDT:** a data structure where edits from different devices merge without conflicts.
- **Yjs:** our CRDT library. A note is a `Y.Doc`, and changes are small binary "updates".
- **Provider:** moves Yjs updates somewhere (IndexedDB, or the server over WebSocket).
- **Awareness:** Yjs's temporary shared state, such as cursors and who's online.
- **Worker / Durable Object / D1 / Wrangler:** see §3.
- **y-partyserver:** Cloudflare's library for running a Yjs sync server inside a Durable Object.
- **Soft delete:** marking as deleted instead of removing, so sync doesn't resurrect it.
