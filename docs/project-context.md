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
> - `docs/plans/`: one plan per task (setup, features, critical fixes)

---

## 1. Goal

Build a lightweight notes app that:

- **Feels instant.** Typing never waits on the network.
- **Syncs quickly.** An edit on one device shows up on the others within about a second.
- **Works offline.** Edits made offline merge automatically when the device reconnects.
- **Runs on Windows and iPhone** as one installable **PWA**, with no app stores.
- **Costs ₹0/month to run**, using free Cloudflare services only.
- **Allows sharing later.** A note can be shared with a few known people, who can edit it together live.

### Non-goals (for now)

- Native apps (Electron, Tauri, Swift). Tauri may wrap the same React app later, for a global hotkey on Windows.
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
| UI kit          | **Tailwind CSS v4 + shadcn/ui**                                   | Components are copied into `src/components/ui/`, so we own them. Add one only when a feature needs it.                                                                                                |
| Lint / format   | **oxlint + oxfmt**, Husky + lint-staged pre-commit                | Fast, one config each. A lint error blocks the commit.                                                                                                                                                |
| Auth            | **Google OAuth via Better Auth + D1**, session cookie (no JWT)    | Free, runs in the Worker. Same origin, so the browser sends the cookie on the WebSocket upgrade and the Worker checks it. Access is limited to an `ALLOWED_EMAILS` allowlist plus Google Testing mode |

Rejected alternatives: Hocuspocus (needs a paid always-on Node server or a flaky free VM), Render's free tier (sleeps, wipes files), Tiptap Cloud (paid).

---

## 3. Cloudflare in 2 minutes

- **Worker:** a small serverless function that runs on Cloudflare's network. Ours is `worker/index.ts`. It handles every request to `jot.deathstalker.dev`.
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
├── wrangler.jsonc            ← Worker, DO bindings, assets
├── components.json           ← shadcn/ui config (aliases use @/*)
├── .oxlintrc.json            ← lint rules
├── .oxfmtrc.json             ← formatter rules
├── vite.config.ts
├── src/                      ← client (React PWA)
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles/index.css      ← Tailwind + shadcn theme variables
│   ├── components/ui/        ← shadcn/ui components (generated, add on demand)
│   ├── editor/               ← TipTap editor + our own toolbar/UI
│   ├── sync/
│   │   ├── provider.ts       ← the ONLY module that imports y-partyserver
│   │   └── indexDoc.ts       ← per-user note list (phase 3)
│   ├── features/
│   │   ├── notes/            ← sidebar, list, search
│   │   └── sharing/          ← phase 6
│   └── lib/                  ← utils (cn), shared helpers
└── worker/                   ← server
    ├── index.ts              ← entry: auth check + routePartykitRequest
    ├── rooms/note-room.ts     ← YServer Durable Object
    └── auth/                 ← phase 4
```

---

## 6. Dependencies (add them only when their phase starts)

| Package                                                                                                | Phase | Purpose                                                                           |
| ------------------------------------------------------------------------------------------------------ | ----- | --------------------------------------------------------------------------------- |
| `tailwindcss`, `@tailwindcss/vite`, shadcn/ui deps (`class-variance-authority`, `tw-animate-css`, ...) | 0     | Styling + UI kit. Installed by `shadcn init`.                                     |
| `oxlint`, `oxfmt`, `husky`, `lint-staged`                                                              | 0     | Lint, format, pre-commit                                                          |
| `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`                                                   | 1     | Editor                                                                            |
| `@tiptap/extension-collaboration`                                                                      | 1     | Binds the editor to Yjs. Install any peer dependency pnpm asks for.               |
| `yjs`                                                                                                  | 1     | CRDT                                                                              |
| `partyserver`, `y-partyserver`                                                                         | 1     | Durable Object server + client `YProvider`                                        |
| `y-indexeddb`                                                                                          | 2     | Local persistence / offline                                                       |
| `minisearch`                                                                                           | 3     | Local search                                                                      |
| `better-auth`                                                                                          | 4     | Google login + sessions, with D1 as its database. Needs the `nodejs_compat` flag. |
| `vite-plugin-pwa`                                                                                      | 5     | Manifest + service worker. **Not earlier**, since caching confuses dev.           |
| `@tiptap/extension-collaboration-caret`                                                                | 6     | Other people's cursors                                                            |

Don't add: `nanoid` (use `crypto.randomUUID()`), any `@tiptap-pro/*` package, or Hocuspocus packages.

### About TipTap's UI

TipTap is **headless**: there's no UI out of the box. Toolbars, menus and styling are our own React components, and content is styled with CSS on `.ProseMirror`. TipTap's open-source **Simple Editor template** may be used as a starting point (its CLI copies the code into our repo, so we own it). The **Notion-like template and Pro components are paid. Don't use them.**

---

## 7. Data model

### Client-side (Yjs)

- **One Y.Doc per note.** Room name: plain `<noteId>` (URL `/parties/note-room/<noteId>`). Holds the rich text (a `Y.XmlFragment` bound to TipTap).
- **One "index" Y.Doc per user.** Party `index-room` (class `IndexRoom`, migration `v2`), room `index-<userId>`, IndexedDB `jot-index-<userId>`. A `Y.Map` named `notes`, one nested `Y.Map` per note (so concurrent edits to different fields both survive):
  ```ts
  { [noteId]: { title: string, preview: string, createdAt: number, updatedAt: number, pinned: boolean, deleted: boolean } }
  ```
  The title is the first line of the note and the preview its next ~200 characters, both written by the editor on local edits only (so there is no separate rename action). Search is MiniSearch over title + preview. The Phase 3 placeholder room `index-default` is gone from the server; the first user to sign in on a device merges that device's old local list into their own index (`src/sync/legacyIndex.ts`).
- IDs are generated on the client with `crypto.randomUUID()`, so notes can be created offline.

### Server-side

- **Note content:** each NoteRoom DO stores the compacted Yjs state (`Y.encodeStateAsUpdate`) in its own SQLite storage.
- **D1 (`jot-db`, binding `DB`, SQL in `migrations/`, applied with `pnpm db:migrate` / `db:migrate:remote`):**
  ```sql
  -- 0001, Phase 4: generated by Better Auth: user, session, account, verification
  -- 0002, Phase 4:
  note_members (note_id, user_id, role, created_at)   -- role: 'owner' | 'editor' | 'viewer'
  -- Phase 6:
  invites      (id, note_id, email, role, token, expires_at)
  ```
  `note_members` has a unique index allowing one owner per note. The first signed-in user to open a note id claims it as owner (ids are random UUIDs, so this works for notes created offline).

---

## 8. Sharing and permissions (phase 6)

- The owner shares a note by email, which adds a row to `note_members` or creates an invite.
- **Every WebSocket connection is checked in the Worker** (session cookie + `note_members`, in `worker/auth/gate.ts`) before routing to the room.
- **Viewers are read-only.** The server must ignore updates from viewer connections. Never trust the client for this.
- Live cursors and names come from Yjs awareness + `CollaborationCaret`.
- "Shared with me" comes from a REST endpoint reading `note_members`, or a reference written into the recipient's index doc.
- **Revoking access:** delete the row and close that user's connections. ⚠️ They keep whatever is already in their IndexedDB. That's inherent to local-first, so accept it.

---

## 9. Hosting and costs

| Item                         | Where                                                             | Cost                                   |
| ---------------------------- | ----------------------------------------------------------------- | -------------------------------------- |
| PWA + sync server            | One Cloudflare Worker (free plan) + SQLite-backed Durable Objects | Free                                   |
| DB                           | DO SQLite + D1                                                    | Free (5 GB account total, 1 GB per DO) |
| Auth                         | Inside the Worker                                                 | Free                                   |
| Email (magic links, invites) | Resend or similar                                                 | Free tier with daily caps              |
| Domain                       | `jot.deathstalker.dev`                                            | Already owned                          |

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

- [x] Login with Google (Better Auth + D1), session cookie instead of a JWT. Only emails in `ALLOWED_EMAILS` can sign up; sign-out syncs, then clears this device's local data
- [x] The Worker checks the session and note ownership before connecting (`onBeforeConnect`/`onBeforeRequest`, Origin check, `index-<userId>` only). `run_worker_first` covers `/api/*` and `/parties/*`
- [x] Deployed on `jot.<account>.workers.dev` and the custom domain `jot.deathstalker.dev` (its DNS was already on Cloudflare), via `pnpm run deploy`

### Phase 5: PWA polish

- [ ] `vite-plugin-pwa`: manifest (`display: standalone`, icons, `theme-color`), app-shell caching
- [ ] iOS fixes (see Traps) and a first-visit "Add to Home Screen" hint

### Phase 6: Sharing

- [ ] D1 `note_members` / `invites`, share dialog, invite emails
- [ ] Server-side read-only for viewers, live cursors, "Shared with me"

### Later (optional)

- [ ] Version history (our own Yjs snapshots)
- [ ] Comments (a `Y.Map` inside the note doc)
- [ ] Tauri wrapper for a global hotkey on Windows

---

## 11. Traps to avoid

### Money traps

- ❌ **Never install `@tiptap-pro/*` or use Tiptap Cloud / paid templates.** Build history and comments ourselves.
- ❌ Don't move hosting to Vercel's free plan (non-commercial only) or Render's free tier (sleeps, wipes files).
- ✅ NoteRoom **must use hibernation** so idle sockets don't consume the free quota.

### Data and sync traps

- ❌ **Never hard-delete notes.** Use `deleted: true`, or an offline device can resurrect them.
- ❌ Don't store note content outside Yjs. There must be one source of truth.
- ❌ Don't put every note in one giant Y.Doc. Use one per note + one index doc per user.
- ❌ Don't trust the client for permissions. Check every connection in the Worker.
- ❌ Don't enable TipTap's normal undo/redo alongside Collaboration. They conflict.
- ⚠️ Save compacted state (`Y.encodeStateAsUpdate`), not an ever-growing list of updates.

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
- A Windows PWA can't register a global hotkey. That needs Tauri later.

---

## 12. Open decisions

| Decision                         | Status      | Notes                                                                                                                 |
| -------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| Usage limits before going public | Not decided | Caps on accounts, notes per user and note size, per-user rate limits. Not needed while only listed emails can sign in |

---

## 13. Rules for agents (the short version also lives in `CLAUDE.md`)

1. Read this file first. If a change contradicts it, raise that instead of silently diverging.
2. Before starting a feature or fix, check `docs/plans/` and create a plan if none exists.
3. Local-first always: the UI reads and writes the local Y.Doc, never a server API, for note data.
4. Free tools only. Flag any paid service or package.
5. All sync-provider code goes through `src/sync/provider.ts`.
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
