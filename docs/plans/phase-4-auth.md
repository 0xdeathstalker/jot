# Plan: Phase 4 – Auth and deploy

Status: ready, decisions made, not started
Source: `docs/project-context.md` §7 (D1 schema), §8, §10 Phase 4, `docs/plans/phase-3-notes-list.md` (index room migration).

Goal: only logged-in people can sync, every note and index room is checked on the server, and the app is live on a real HTTPS URL. After this phase you can open Jot on your phone.

## Decisions (made by owner)

| Topic        | Choice                                                                                                                                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Login        | **Google OAuth** only                                                                                                                                                                                                                                              |
| Auth library | **Better Auth + D1** (MIT, free). D1 wiring is verified in the spike (A1–A3) before anything is built on it, see "Risks"                                                                                                                                           |
| Socket auth  | **Session cookie**, not a JWT. App and server share one origin, so the browser sends the cookie on the WebSocket upgrade and the Worker looks the session up in D1 (`onBeforeConnect`). This replaces the JWT wording in project-context §10 and I update it in G3 |
| First deploy | **`jot.<account>.workers.dev`**. The custom domain `jot.deathstalker.dev` is a separate last step (F) because it needs a DNS move                                                                                                                                  |

Defaults I chose without asking (change them if you disagree):

- **Who may use the app (decided, see "Access control" below):** a Worker allowlist `ALLOWED_EMAILS` **plus** Google's Testing mode. **Empty or missing means nobody** (fail closed), so forgetting the secret never opens the app to the public. Phase 6 replaces the allowlist with invites.
- **Note ownership is claimed on first connection.** Table `note_members` (the Phase 6 schema, used now with role `owner`). The first logged-in user to connect to a note id becomes its owner. Ids are random UUIDs, so this works offline-first (notes are created offline, claimed when first synced). Old plain-id dev notes such as `test` get claimed by whoever connects first.
- **Index room per user:** `index-<userId>` (party `index-room`). The Worker only lets you open your own.
- **Login required to open the app.** No logged-out local-only mode. Once logged in the app must still open **offline** (see traps).
- **Sign out syncs then clears local data** on that device (B4b). Offline notes need one online visit after the next sign-in.

## Access control (decided: no paid plan, no daily upkeep)

The free Workers plan stops at its daily limit and **never upgrades or bills by itself**. The only way to spend money is you switching to the paid plan, so there is no cost risk here. What the free quota can be hurt by is strangers using it, so only people you list get in:

- **Gate 1, Google (Testing mode):** only the Google accounts listed as Test users can sign in at all.
- **Gate 2, our Worker (`ALLOWED_EMAILS`):** the second check. If the list is empty or missing, nobody can create an account.
- **Day to day: nothing to do.** No daily or weekly upkeep. The lists change only when **you add a person**, which is a rare, two-step action (adding someone later):
  1. Google Cloud Console > OAuth consent screen > Test users > add their Gmail.
  2. `pnpm exec wrangler secret put ALLOWED_EMAILS` with the full new comma-separated list (no redeploy needed).
- Testing mode does **not** log you out after 7 days here: that expiry applies to Google refresh tokens, we only request `openid`, `email` and `profile` (exempt), and sessions are Better Auth's own cookies.
- When Phase 6 sharing arrives (or you want many users), publish the Google app (no verification needed for these scopes) and let invites replace the allowlist.

Not built now (a later "limits" phase, only if you go public): a cap on total accounts, a cap on notes per user, a note size cap, and per-user rate limits. With only your listed accounts, the free quota is far from reached.

## Out of scope

Magic link / other providers, email sending, invites and sharing (Phase 6), viewer read-only rules, PWA and offline app shell (Phase 5), rate limiting, account deletion, Trash UI.

## Risks to resolve in the spike (step A)

- Better Auth's own docs do not show a Cloudflare **D1** setup. Third-party repos do it either through Kysely's D1 dialect, `database: { d1: env.DB }`, or Drizzle, and one report of a bundled-adapter hang exists (Kysely connection mutex). A1–A3 try the simplest form first. If it needs an extra package (`kysely-d1`, `drizzle-orm`), **I stop and ask you** before adding it.
- The docs I read said nothing about the exact version that supports D1, so the spike also records the version that works.

## Data model

D1 database `jot-db`, binding `DB`. Migrations live in `migrations/` and are applied with `wrangler d1 migrations apply`.

```sql
-- 0001: Better Auth tables (generated by its CLI): user, session, account, verification

-- 0002: ours
CREATE TABLE note_members (
  note_id    TEXT NOT NULL,
  user_id    TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('owner','editor','viewer')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (note_id, user_id)
);
-- at most one owner per note: makes the "claim" race-safe
CREATE UNIQUE INDEX note_one_owner ON note_members (note_id) WHERE role = 'owner';
```

## Manual setup you do once (Google Cloud Console)

1. APIs & Services > OAuth consent screen: user type **External**, keep it in **Testing**, add your Google account(s) under **Test users**. (Basic sign-in scopes need no Google verification. Anyone who is not a test user is rejected by Google until you publish the app.)
2. Credentials > Create OAuth client ID > **Web application**.
3. Authorized redirect URIs: `http://localhost:5173/api/auth/callback/google` now; add `https://jot.<account>.workers.dev/api/auth/callback/google` in step E and the custom domain in step F.
4. Keep the client id and secret for `.dev.vars` (A6) and `wrangler secret put` (E3).

## Task list

Small tasks, in order. Each ends with a "done when" check, and `pnpm check` must pass after every code task. **Checkpoints** are the points to stop and test.

### Step A: Auth on the Worker (spike first)

- [x] **A1. Install.** `pnpm add better-auth`. Done when: it is in `package.json`.
- [x] **A2. Config.** In `wrangler.jsonc`: `"compatibility_flags": ["nodejs_compat"]` (Better Auth needs `node:async_hooks`/`node:crypto`), a `d1_databases` entry `{ "binding": "DB", "database_name": "jot-db", "database_id": "local" }` (real id comes in E1), and `assets.run_worker_first: ["/api/*", "/parties/*"]`. Both are required: the Google callback is a browser **navigation**, and a WebSocket handshake is a GET, so the SPA fallback would otherwise answer either with `index.html` before the Worker (and its permission guard) runs. Then `pnpm cf-typegen`. Done when: `pnpm check` passes.
- [x] **A3. Auth instance.** `worker/auth/auth.ts` exporting `createAuth(env, origin)`, built **per request** because bindings only exist on `env`: Google provider from `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `secret` from `BETTER_AUTH_SECRET`, `baseURL` and `trustedOrigins` from the request origin (so localhost, workers.dev and the custom domain all work with no code change), D1 as the database, and a `databaseHooks.user.create.before` hook that rejects emails outside `ALLOWED_EMAILS` (trimmed, case-insensitive; empty or missing list rejects everyone). Done when: it type-checks. **Spike result: no extra package needed.** Better Auth 1.7.19 has a built-in D1 dialect that switches on when `database` is the D1 binding (its Kysely adapter detects `batch`/`exec`/`prepare`).
- [x] **A4. Schema.** Generate Better Auth's SQL with its CLI into `migrations/0001_auth.sql`, write `migrations/0002_note_members.sql` from the model above, and add scripts `db:migrate` (`wrangler d1 migrations apply jot-db --local`) and `db:migrate:remote` (`--remote`). Done when: `pnpm db:migrate` applies both with no error.
- [x] **A5. Mount.** In `worker/index.ts`, send `/api/auth/*` to `createAuth(env, origin).handler(request)` before `routePartykitRequest`. Done when: `pnpm check` passes.
- [x] **A6. Secrets locally.** Create `.dev.vars` (already gitignored via `.dev.vars*`) with `BETTER_AUTH_SECRET` (32+ random chars), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS`, and a committed `.dev.vars.example` with the keys and no values. Done when: `pnpm dev` starts.
- [x] **A7. Checkpoint: Worker side.** (First half done and verified: `/api/auth/ok` returns `{"ok":true}` even with browser navigation headers, so `run_worker_first` works. The Google half waits for your OAuth client.) `curl http://localhost:5173/api/auth/ok` returns ok, and opening `/api/auth/sign-in/social` via the client in B5 reaches Google. Done when: the first works now.

### Step B: Client login

- [x] **B1. Client.** `src/auth/client.ts`: `createAuthClient` from `better-auth/react` (same origin, no `baseURL`). Done when: `pnpm check` passes.
- [x] **B2. Session gate.** `useAuthUser()`: while loading show nothing flashy; session present gives the user; **session absent AND online** gives the login screen; a **network error** (offline) falls back to the last user id cached in `localStorage` so an offline reopen still works. Wrap every storage read in try/catch. Done when: it type-checks.
- [x] **B3. Login screen.** One centered "Continue with Google" button calling `authClient.signIn.social({ provider: "google" })`. Done when: it renders when logged out.
- [x] **B4. Account and sign out.** Sidebar footer: avatar or initial, name, a "Sign out" action. Sign out clears the cached user id and calls `authClient.signOut()`. Done when: it shows when logged in.
- [x] **B4b. Sign out syncs, then clears this device (B6 in spirit).** Decided: variant B. Before signing out, `syncAllLocalData(userId)` (`src/sync/provider.ts`) opens a throwaway connection to this user's index and to every local note and waits for the server handshake (6 s each). If every room synced, sign out and clear silently. If some could not (offline, refused, e.g. another account's leftovers), ask once: "N notes could not be synced. Sign out and discard them?" (Cancel keeps you signed in). Clearing is deferred to the next page load (`wipeIfPending` in `src/main.tsx`, flag in `src/sync/localData.ts`) because the running app's own connections would block the delete; it removes every `jot-*` IndexedDB database. Session expiry or a refused socket never clears anything. Done when: signing out empties `jot-*` in DevTools > Application > IndexedDB.
- [x] **B5. Checkpoint: login locally.** Log in with Google on `localhost:5173`, reload (stays logged in), sign out (back to login). Use `localhost`, not `127.0.0.1`: the redirect URI and cookie are host-specific. Done when: all three work.

### Step C: Per-user index

- [x] **C1. Index session takes the user.** `useIndexSession(userId)` in `src/sync/provider.ts`: room `index-${userId}`, IndexedDB `jot-index-${userId}`. These become the permanent names; the Phase 3 placeholders stop being used. Done when: `pnpm check` passes.
- [x] **C2. Wire.** `App` renders the app only with a user and passes `user.id`. Done when: the sidebar loads for the logged-in user.
- [x] **C3. Carry over dev notes.** On first login on a device, if IndexedDB `jot-index-default` holds notes and the user's index is empty, merge it in (`Y.applyUpdate(newDoc, encodeStateAsUpdate(oldDoc))`), then set a `localStorage` flag so it runs once. This is only for your existing dev notes; note bodies are untouched because their rooms are unchanged. Done when: your old notes show in the new index. Skip this task if you do not care about the dev notes.
- [x] **C4. Checkpoint.** Create a note, reload, sign out and back in: the list is the same. Done when: it is.

### Step D: Server permission checks (`worker/`)

- [x] **D1. `getUser(request, env)`.** Uses Better Auth's `api.getSession({ headers })`; returns the user or `null`, **also `null` when the email is no longer in `ALLOWED_EMAILS`** (the sign-up hook only covers new accounts, so removing someone must take effect here). Done when: it type-checks.
- [x] **D2. Gate in `onBeforeConnect`.** Pass `onBeforeConnect(req, lobby)` to `routePartykitRequest`: no user gives `401`; `lobby.party` is `index-room` and `lobby.name !== "index-" + user.id` gives `403`; `lobby.party` is `note-room`: run the claim-or-member check (D3). Also use `onBeforeRequest` so plain HTTP hits to `/parties/...` are covered. Done when: an unauthenticated WebSocket upgrade is refused.
- [x] **D3. Claim or member.** In one D1 batch: `INSERT OR IGNORE INTO note_members (note_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)`, then `SELECT 1 FROM note_members WHERE note_id = ? AND user_id = ?`. No row means the note is owned by someone else, so `403`. The unique owner index makes two simultaneous first connections safe. Done when: a second account gets `403` on the first account's note.
- [x] **D4. Origin check.** Reject WebSocket upgrades whose `Origin` is not the request's own origin (defense against cross-site WebSocket hijacking). Done when: a fake `Origin` header gets `403`.
- [x] **D5. Checkpoint: headless 401.** `curl -i -H "Upgrade: websocket" -H "Connection: Upgrade" -H "Sec-WebSocket-Key: x" -H "Sec-WebSocket-Version: 13" http://localhost:5173/parties/note-room/abc` returns `401`. Done when: it does.
- [x] **D6. Checkpoint: two accounts (manual).** Add a second Google test user and email to `ALLOWED_EMAILS`. Account A creates a note; account B (other browser) opens `?note=<A's id>` and gets no content (the socket is refused and its editor stays empty), while B's own notes still sync. Done when: A's text never appears for B.

### Step E: Deploy to workers.dev

- [ ] **E1. D1 database (you run).** `pnpm exec wrangler login` if needed, then `pnpm exec wrangler d1 create jot-db`. Paste the returned `database_id` into `wrangler.jsonc`. This creates a free resource in your Cloudflare account. Done when: the id replaces `"local"`.
- [ ] **E2. Remote schema.** `pnpm db:migrate:remote`. Done when: it lists both migrations as applied.
- [ ] **E3. Secrets (you run).** `pnpm exec wrangler secret put BETTER_AUTH_SECRET`, then `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAILS`. Secrets never go in `wrangler.jsonc`. Done when: `wrangler secret list` shows all four.
- [ ] **E4. Google redirect URI.** Add `https://jot.<account>.workers.dev/api/auth/callback/google` in the Cloud Console. Done when: it is saved.
- [ ] **E5. Deploy.** `pnpm check && pnpm deploy`. The first deploy applies migration `v2` (the `IndexRoom` class, already in `wrangler.jsonc`) and `v1`. Done when: the URL loads.
- [ ] **E6. Checkpoint: real devices.** Log in on the laptop and on your **phone over HTTPS**; a note created on one appears on the other within about a second, and editing offline then reconnecting merges. This is the cross-device test we could not do on localhost. Done when: all pass.

### Step F: Custom domain (separate, you run)

- [ ] **F1. DNS move.** Add `deathstalker.dev` to Cloudflare and **review every imported DNS record before switching nameservers**, then change them at your registrar. This affects any other site on that domain, so do it deliberately. Done when: Cloudflare shows the zone Active.
- [ ] **F2. Attach.** Add `"routes": [{ "pattern": "jot.deathstalker.dev", "custom_domain": true }]` to `wrangler.jsonc`. Done when: the config validates.
- [ ] **F3. Google URI.** Add `https://jot.deathstalker.dev/api/auth/callback/google`. Done when: saved. (No code change: `baseURL` comes from the request.)
- [ ] **F4. Deploy and test.** Done when: login and sync work on the custom domain.

### Step G: Wrap-up

- [ ] **G1. Full checks.** `pnpm check`, `pnpm build`, `pnpm exec wrangler deploy --dry-run`. Done when: all pass.
- [ ] **G2. README.** Add the one-time setup (Google client, `.dev.vars`, `db:migrate`, secrets) to `README.md`. Done when: a fresh clone can log in by following it.
- [ ] **G3. Docs.** Update `docs/project-context.md`: §2 and §10 (cookie sessions instead of JWT), §6 (`better-auth`), §7 (`note_members` now created, claim-on-first-connect, `index-<userId>`), §8, Phase 4 boxes. Done when: no stale "JWT" wording remains.
- [ ] **G4. Commit** in the split: `feat: D1 and Better Auth on the Worker` (A), `feat: login UI and per-user index` (B–C), `feat: permission checks for rooms` (D), `docs: update project context for phase 4` (G). Done when: the pre-commit hook passes on each.

## Details and traps

- **`run_worker_first` is mandatory for `/api/*` and `/parties/*`.** Without the first, the OAuth callback returns `index.html` and login never completes. Without the second, `wrangler dev` (and possibly production) serves `index.html` for room GETs and the permission guard never runs. `pnpm dev` (Vite) hid this because it routes differently, so always verify the guard against `wrangler dev` or a deploy, not only `pnpm dev`.
- **Build the auth instance per request** (needs `env`). Do not create it at module level.
- **Do not lock yourself out offline.** A failed session lookup because the network is down is not "logged out". Only an explicit "no session" from the server shows the login screen.
- **Never trust the client.** The user id in the room name is checked against the session server-side; the client's cached user id is only used for naming local storage.
- **Claim race:** the unique partial index `note_one_owner` is what makes two simultaneous first connections safe. Do not replace it with a SELECT-then-INSERT.
- **Secrets:** `.dev.vars*` is already gitignored; production secrets go through `wrangler secret put` only.
- **Redirect URI mismatch** (`redirect_uri_mismatch`) means the Google console URI differs from `baseURL`/origin. Local uses `localhost`, never `127.0.0.1`.
- **Google "Testing" mode:** only listed test users can sign in. That is intended until Phase 6. Sessions are Better Auth's own cookies, so the 7-day refresh-token expiry of Testing mode does not log you out.
- **Allowlist fails closed:** an empty or missing `ALLOWED_EMAILS` blocks every new sign-up. Set it before the first login (A6 locally, E3 in production), otherwise even you cannot sign in. Compare emails case-insensitively and trimmed.
- **Old `index-default` room** becomes unreachable (the Worker refuses it). Its data stays on the server, unused. Only a device that still has the local copy can carry it over (C3).
- **Reconnect loop:** a refused socket (401/403) makes `YProvider` retry with backoff. It is capped, so tolerated; the login gate (B2) handles a really expired session.
- **D1 limits (free):** 5M reads and 100k writes per day, 5 GB total. Auth plus one `note_members` lookup per socket connection is tiny.
- **Migrations are append-only:** D1 SQL files never get edited after `--remote` apply; add `0003_...`. Durable Object migrations likewise (`v1`, `v2` stay as they are).
- **Sign out clears IndexedDB** (B4b). Caveat: "synced" is y-websocket's handshake flag, so the guarantee is "the server answered after our state went out", not an end-to-end acknowledgement. Clearing happens only after that, or after you confirm discarding.
