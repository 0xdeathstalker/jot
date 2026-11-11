# Plan: Phase 6 – Sharing

Status: in progress (steps A to G built; H0 and H onward to do)
Source: `docs/project-context.md` §7 (data), §8 (sharing and permissions), §10 Phase 6, `docs/plans/phase-4-auth.md` (guard, claim-or-member, allowlist).

Goal: an existing Jot user can (1) invite up to 3 friends to Jot with one join link, and (2) share a note with up to 2 other people with a share link. Both are plain links sent through any chat app, no email. Editors type together live and see each other's cursors. Viewers can read but never change anything, and the **server** enforces that.

## How it works (UI)

1. **Join (once per new person).** An original user opens the account menu, taps **Invite a friend to Jot** and copies the link. The friend opens `/join/<token>`, signs in with Google and lands in their own empty Jot, where they can create notes like anyone else.
2. **Share a note.** The owner opens a note, taps **Share**. A dialog shows: a choice **Can edit / Can view**, a **Copy link** button, the people with access (each with a Remove button), and **Turn off link**.
3. B (already a Jot user) opens `/share/<token>`. Signed in: it accepts straight away. The note opens and is added to B's list with a small "Shared" label (and "View only" for viewers). Both people see each other's cursor and name.
4. Owner removes B: B's connection closes within seconds and the note shows "You no longer have access".

## Decisions (made by owner)

| Topic                       | Choice                                                                                                                                                                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| How people are invited      | **Link only, no email.** No email service, no new dependency. An email option can be added later without changing the tables                                                                              |
| Who may sign in             | **`ALLOWED_EMAILS` accounts, or people who joined through a join link.** The Google consent screen moves from Testing to **In production** (manual step J1), so the join link is the gate                 |
| Join links                  | **Any original user can invite up to 3 people to Jot** with one general link. Invited users cannot invite further                                                                                         |
| People per note             | **The owner plus at most 2 others**                                                                                                                                                                       |
| Two separate links          | **Join link and share link stay separate.** A share link never creates an account: a person with no Jot account is told to ask for a join link first. This keeps the "3 people per user" limit meaningful |
| Link behavior               | **Reusable until revoked.** One link per note and role, expires after 7 days, the owner can turn it off or make a new one (a new one replaces the old)                                                    |
| Owner deletes a shared note | **Everyone loses access.** The data stays in storage (soft delete, never hard-deleted)                                                                                                                    |
| Who can share               | **Owner only.** Editors edit the text; they cannot create links or remove people                                                                                                                          |
| Changing a role             | **The owner can raise or lower a person's role from the Share dialog** (step H0). A share link can still only raise a role, never lower it                                                                |

Defaults I chose without asking (change them if you disagree):

- **Two kinds of link.** A **join link** (`/join/<token>`) lets a stranger become a Jot user. A **share link** (`/share/<token>`) gives an existing user access to one note. A stranger who opens only a share link cannot sign up; they need a join link first.
- **Join link rules.** One live link per original user, valid 7 days (the user can renew or turn it off). It admits at most **3 people in total** per original user. Invited users are full users (they can create notes and share them) but cannot make join links, so the total stays bounded. Only accounts on `ALLOWED_EMAILS` count as original users.
- **Per note: the owner plus at most 2 other people**, never more.
- A link stores its token as-is in D1 so the owner can copy it again later. (Hashing would mean it can only be shown once.)
- Awareness (name, colour) is trusted from the client. A person could show a fake name on their own cursor. It cannot change permissions.
- Removing someone does not erase what is already in their device's IndexedDB (inherent to local-first, `docs/project-context.md` §8). Jot deletes that local copy when they next open the note and get refused.

## Out of scope

Email invites, per-person invites by email address, invited users inviting others, a global user cap, per-user note limits, comments, version history, "who is online" avatar list, note transfer between owners, public read-only links for people without Google.

## New packages (flagged per CLAUDE.md; MIT and free)

`@tiptap/extension-collaboration-caret` (already planned in §6 for this phase; peers `@tiptap/extension-collaboration` and `y-tiptap` are installed). shadcn components added only when a task needs them: `dialog`, `toggle-group` (or `tabs`), and maybe `badge`. No server packages.

## Task list

Small tasks, in order. Each ends with a "done when" check and `pnpm check` must pass after every code task. Server rules are tested against **`wrangler dev`** after `pnpm build` (CLAUDE.md), not only `pnpm dev`.

### Step A: Spikes (prove the risky parts before building)

- [x] **A1. Role to the room, read-only, and hibernation.** `onBeforeConnect` may return a changed `Request`. Add a header `x-jot-role` (always overwrite what the client sent), read it in `NoteRoom.onConnect(connection, ctx)`, store it with `connection.setState({ role, userId })`, and override `isReadOnly(connection)` (it exists in y-partyserver 2.2.0: `readSyncMessage` drops updates when it returns true). Done when: a viewer's edit never reaches the document, an editor's does, and the role is still known after the Durable Object hibernates and wakes (connection state is serialized). **Result: works.** `guardRoom` now returns a `Request` with `x-jot-role` and `x-jot-user` (overwritten, never copied); `NoteRoom.getConnectionTags` turns them into tags `role:<r>` and `user:<id>`. Tags are used instead of `connection.state` because y-partyserver already keeps awareness ids in `state`. `isReadOnly` is true for viewers and, as a safe default, for any connection without a role tag. Tested on `wrangler dev` with forged sessions: viewer edit dropped even with forged `x-jot-role: owner`, editor edit saved, a fresh reader never sees viewer text, and the same held after 20 s idle with sockets open. Not proven: that the Durable Object really hibernated during those 20 s (no way to observe it locally); tags are a runtime feature that survives hibernation, and the real check is the deployed two-account test (K1).
- [x] **A2. Kick a user from the Worker.** Use partyserver's `getServerByName(env.NoteRoom, noteId)` to get a stub and call a public method `kick(userId)` that closes that user's connections (`connection.close(4403, "removed")`). Done when: a connected socket is closed within a second of the call, including after hibernation. **Result: works.** `worker/rooms/kick.ts` (`getServerByName(env.NoteRoom, noteId)` then `room.kick(userId)`); only that user's sockets close, with code 4403, and others stay connected. A removed member is refused with 403 on reconnect. Note: `wrangler dev` runs the built Worker from `dist/`, so run `pnpm build` after every Worker change before testing.
- [x] **A3. Can the sign-up hook see the join link?** Better Auth's `databaseHooks.user.create.before` receives the context as a second argument. Check whether it can read a cookie `jot-invite` set by the login screen just before the redirect to Google (the callback is a top-level GET, so a `SameSite=Lax` cookie is sent). Done when: the answer is known. **If yes:** sign-up is allowed for allowlisted emails or a live join token in that cookie (strict). **If no:** fallback is to allow every sign-up but keep the account inactive until it joins (rule in B2 already enforces it), and note the extra `user` rows in the plan. **Result: yes, by the types.** Better Auth 1.7.19 calls `databaseHooks.user.create.before(user, context)` with the endpoint context, which has `request` and `getCookie(name)`. A real proof needs a Google callback, so it is confirmed in B4/E4 when a new account signs in locally; the fallback in this task stays ready.
- [x] **A4. Caret package.** Install `@tiptap/extension-collaboration-caret`; confirm it takes the `YProvider` (needs `provider.awareness`) and that `src/sync/provider.ts` can expose the awareness without importing y-partyserver anywhere else. Done when: two tabs show each other's cursor in a throwaway change. **Result: compatible.** `@tiptap/extension-collaboration-caret` 3.33.1 takes `provider: any` and reads `provider.awareness`; `useNoteSession` already returns the `YProvider`, which has `awareness`, so `provider.ts` needs no change. Installing it produced a peer warning for `@tiptap/core`, fixed by `pnpm update "@tiptap/*"` (all TipTap packages now 3.33.1, `@tiptap/y-tiptap` 3.3.0); build and checks pass. The visual two-tab check is done in I2 once the editor uses it.

Record each result under its task, as the Phase 5 plan did.

### Step B: Data and rules on the server

- [x] **B1. Migration `0003_sharing.sql`** (new file, never edit 0001/0002): **Done:** `migrations/0003_sharing.sql` written and applied locally (the real database still needs `pnpm db:migrate:remote` before deploy, step J2).

  ```sql
  CREATE TABLE note_invites (
    token      TEXT PRIMARY KEY,                    -- 32 random bytes, base64url
    note_id    TEXT NOT NULL,
    role       TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER
  );
  -- one live link per note and role: making a new one revokes the old one first
  CREATE UNIQUE INDEX note_invite_live ON note_invites (note_id, role) WHERE revoked_at IS NULL;

  -- "Join Jot" links: one live link per original user
  CREATE TABLE user_invites (
    token      TEXT PRIMARY KEY,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    revoked_at INTEGER
  );
  CREATE UNIQUE INDEX user_invite_live ON user_invites (created_by) WHERE revoked_at IS NULL;

  -- who joined through whom; its row count per inviter is the "3 places" limit
  CREATE TABLE invited_users (
    user_id    TEXT PRIMARY KEY,
    invited_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX invited_users_by_idx ON invited_users (invited_by);
  ```

  Apply with `pnpm db:migrate` (local) and `pnpm db:migrate:remote` (before deploy). Done when: the tables exist locally.

- [x] **B2. Who counts as an active user.** In `worker/auth/gate.ts` split `getUser` into "signed in" and "active": active = email in `ALLOWED_EMAILS` **or** a row in `invited_users`. Every room and every API route except `/api/join/accept` requires active. Active users can claim new note ids and open `index-<userId>` as today. Membership in a shared note does **not** make someone active. Done when: a signed-in stranger gets 401 on every room, and an invited user behaves like an original one. **Done:** `worker/auth/invites.ts` has `isActiveUser`; `gate.ts` uses it for every room. Tested on `wrangler dev`: a stranger gets 401 and claims nothing, an invited user can claim and open their own note (becomes owner), an original user is unaffected.
- [x] **B3. `canOpenNote` returns the role** (`owner` / `editor` / `viewer` / null) from the same query, and `guardRoom` forwards it as `x-jot-role` (A1). Done when: still one D1 read for a repeat visit. **Done in A1:** `canOpenNote` returns the role from the same query and `guardRoom` forwards it.
- [x] **B4. Sign-up hook** per the A3 result: allowed if the email is on `ALLOWED_EMAILS` or the `jot-invite` cookie holds a live join token whose inviter still has a free place; if the fallback is used, allow the sign-up but the account stays inactive (B2). Done when: a stranger without a join link cannot become active. **Done:** `auth.ts` `user.create.before` allows an allowlisted email or a live join token from the `jot-invite` cookie (`canJoin`); `after` records the join with one atomic statement (`recordJoin`), so two people cannot take the last place. Tested against the local D1 (valid, unknown, expired, revoked, maker left the allowlist, 3 places then refused, race for the last place). Not yet proven end to end: the cookie arriving through a real Google callback. That is checked in E4 (local sign-in with a non-allowlisted account); if it fails, the inert-account fallback applies.

### Step C: Share API (`worker/share.ts`, routed from `worker/index.ts` under `/api/share/`)

All routes: same-origin check (`Origin` must equal the request origin, like the socket guard), JSON only, session required, and the owner check on `note_members` for the owner-only ones. `/api/*` is already `run_worker_first`, so no wrangler change.

- [x] **C1. `GET /api/share/:noteId`** (owner): members (name, email, role) joined from Better Auth's `user` table, plus the live links per role (token, expiry). Done when: it returns the owner alone for a new note. **Done** (`worker/share.ts`; shared helpers in `worker/http.ts`).
- [x] **C2. `POST /api/share/:noteId/invite {role}`** (owner): revoke the live link for that role, create a new one valid for 7 days, return the full URL (`/share/<token>`). Refuses when the note already has 2 other members. Done when: calling it twice leaves exactly one live link. **Done.**
- [x] **C3. `DELETE /api/share/:noteId/invite/:role`** (owner): set `revoked_at`. Done when: opening a revoked link fails (D2 test). **Done.**
- [x] **C4. `POST /api/share/accept {token}`** (any active user): token must exist, not revoked, not expired, and the note must have fewer than 2 members besides the owner (unless the caller is already one). Insert `note_members` with `INSERT OR IGNORE`, and only **upgrade** an existing role (viewer to editor), never lower the owner or an editor. Return `{ noteId, role }`. Error codes: 404 invalid, 410 expired or revoked, 409 full. Done when: each case returns its code. **Done.** The limit check and the insert are one statement. A second link only ever raises a role.
- [x] **C5. `DELETE /api/share/:noteId/members/:userId`** (owner removes anyone but themself; any member can remove only themself = **leave**): delete the row, then `kick(userId)` (A2). Done when: the removed user's open socket closes. **Done.** Anyone can remove only themself (leave); the owner cannot leave or be removed.
- [x] **C6. `DELETE /api/share/:noteId`** (owner, "unshare everything", called when the owner deletes a shared note): delete all non-owner rows, revoke links, kick everyone. Done when: all other members are refused afterwards. **Done.**
- [x] **C7. `GET /api/share/mine`**: note ids where the caller is a non-owner member, with roles. Used to clean up the list (H3). Done when: it matches the rows. **Done.**
- [x] **C8. Join links** (`/api/join/`): `POST /api/join` (original users only) creates or returns the caller's live join link (7 days, replaced on request); `DELETE /api/join` turns it off; `GET /api/join` returns the link and `used` / 3. `POST /api/join/accept {token}` (signed in, not yet invited): token valid, inviter has fewer than 3 invited users, then insert `invited_users (user_id, invited_by)`. Codes: 404 invalid, 410 expired or revoked, 409 no places left. Done when: each case returns its code and a fourth person is refused. **Done** (`worker/join.ts`; `joinStatus` in `invites.ts` gives the 404/410/409 codes).

### Step D: Room enforcement

- [x] **D1. `NoteRoom`** keeps `role` and `userId` in the connection state, `isReadOnly` returns true for viewers, `kick(userId)` closes that user's connections (A1/A2 become production code). Done when: the A1 and A2 results hold in `wrangler dev`. **Done in step A** (`note-room.ts`: tags `role:` and `user:`, `isReadOnly`, `kick`); confirmed in D2.
- [x] **D2. Checkpoint: server tests (headless, forged sessions as in Phase 4).** Cases: owner 101; editor 101 and edit persists; viewer 101 but edit ignored, content unchanged after reconnect; non-member 403; stranger (not allowlisted, not joined) 401; invited user can claim and open their own notes; revoked and expired share links refused; removed user's socket closes; an expired session 401; wrong Origin 403; third other person on a note 409; fourth invited user for one inviter refused; an invited user cannot create a join link; a revoked join link refused. Done when: all pass, run against `wrangler dev`. Delete any test users and sessions created in the local D1 afterwards. **Result: 28 checks pass** on `wrangler dev` with forged sessions, using the real share API for every change: editor edits saved, viewer edits dropped (even with forged role headers, also after 15 s idle), a fresh reader never sees viewer text; removing a member, leaving, and unsharing each close the right sockets with 4403 and reconnects get 403 while others stay connected; a stranger gets 401 on note and index rooms; an invited user can claim a note and open their own index room but not someone else's; non-member 403; wrong Origin 403; expired session 401. Join/share limits and link rules (third person 409, fourth joiner 409, revoked/expired 410) were covered by the C-step checks. Test data was deleted afterwards.

### Step E: Client plumbing (`src/features/sharing/`)

`fetch` is banned in `src/editor` and `src/features/notes`, so all share requests live in `src/features/sharing/api.ts`.

- [x] **E1. Index meta fields** in `src/sync/indexDoc.ts`: optional `role` (`"editor"` or `"viewer"`; absent means you own it) and optional `shared` (owner has issued a link). Existing notes need no migration. Done when: an old index still loads, and `useNotes` exposes both. **Done:** `role` and `shared` in `src/sync/indexDoc.ts`, plus `addSharedNote` (also brings back an entry left earlier, and upgrades a role) and `markShared`. Tested with a plain Y.Doc.
- [x] **E2. `api.ts`**: typed wrappers for C1 to C7 returning the error code as data, not exceptions for expected cases. Done when: it type-checks. **Done:** `src/features/sharing/api.ts`; failures return `{ ok: false, status, error }`, and `offline` means the request never reached the server.
- [x] **E3. Share-link page.** `App.tsx` recognises the path `/share/<token>` (the Worker's SPA fallback and the service worker already serve it). Signed out: `LoginScreen` with "Sign in to open this note" (a person with no Jot account cannot sign up this way: say so and tell them to ask for a Jot join link). Signed in: call accept (C4), write the entry into the index (`role`, a placeholder title "Shared note" until the doc loads), then `history.replaceState` to `/?note=<id>` so the token leaves the URL and history. Errors show a plain message with a "Go to my notes" button. Offline shows "Connect to the internet to open this link". Done when: each outcome renders. **Done in code** (`ShareLinkPage.tsx`, `inviteLink.ts`; the automatic "open newest note" redirect is paused while a share link is pending, and `useNoteId` now uses absolute `/?note=` URLs so it works from `/share/<token>`). Manual check in E5.
- [x] **E4. Join page and join link UI.** `/join/<token>`: signed out shows `LoginScreen` with "You've been invited to Jot"; the Google button sets the `jot-invite` cookie (A3) and uses the join URL as `callbackURL`. Signed in: call the join endpoint (C8), then `history.replaceState` to `/`. Original users also get an **Invite a friend to Jot** item in the account menu (`AccountFooter`) that shows the link, how many of the 3 places are used, and **Turn off link**; invited users do not see it. Done when: each outcome renders and an invited user has no invite item. **Done in code** (`JoinPage.tsx`, `InviteFriend.tsx` in the account footer, `LoginScreen` sets the `jot-invite` cookie before Google and returns to the link page). The guest-account part of the old E4 was dropped when invited users became full users. Manual check in E5.
- [x] **E5. Checkpoint (manual, yours): join link with a real Google sign-in.** This also proves the sign-up hook receives the cookie (A3/B4). In `.dev.vars` take one of your test accounts out of `ALLOWED_EMAILS` (keep it under Test users in the Google Console), delete its local user row so it counts as a brand-new sign-up (`pnpm exec wrangler d1 execute jot-db --local --command "DELETE FROM user WHERE email='that@address'"`), and restart `pnpm dev`. Then: (1) sign in as an allowlisted account, open the account area, **Invite a friend to Jot**, create and copy the link; (2) in a private window sign in as the removed account **without** the link: it must be refused ("not allowed"); (3) open the link in the private window, **Continue with Google** as that account: it must land in an empty Jot where it can create a note, and the first account's counter reads 1 of 3. Done when: all three behave. The share-link page needs a link, so it is tested after the share dialog exists (step F, then K1).

### Step F: Share dialog

- [x] **F1. Add shadcn `dialog`** (and `toggle-group`) with `pnpm dlx shadcn@latest add`. Done when: they exist and `pnpm check` passes. **Done:** `dialog` and `toggle-group` added (both on the base-ui primitives the project already uses).
- [x] **F2. `ShareDialog`.** Opens from a **Share** button in the editor header (owner only). Role toggle, **Copy link** (`navigator.clipboard.writeText`; fall back to a selected read-only input on Safari when blocked), expiry text, **Turn off link**, member list with **Remove**. Sets `shared` on the owner's index entry when the first link is made. Requires online; offline shows "Go online to share". Done when: copy, rotate and remove all work against the local Worker. **Done in code** (`src/features/sharing/ShareDialog.tsx`, Share button above the editor for notes you own). Offline it says "Go online to share this note."; the link area follows the Can view / Can edit toggle; the create button is disabled when the note already has 2 other people. Not yet clicked through in a browser: see F4.
- [x] **F3. Sidebar labels.** "Shared" label on shared notes (owned with `shared`, or `role` set) and "View only" on viewer notes. Done when: they show and search is unaffected. **Done:** a small "Shared" label (notes you share, or that someone shared with you) and "View only" (viewer notes) in `NoteList.tsx`.
- [x] **F4. Checkpoint (manual, yours): click through the dialog locally.** With the two accounts from E5 on `pnpm dev`: (1) as the original account open a note, tap **Share**, switch between **Can view** and **Can edit**, **Create** a link, **Copy link**; (2) in the private window (second account) open that link: the note must appear in its list with a "Shared" label and open; (3) back in the first account the Share dialog lists that person with **Remove**; (4) **Turn off link**, then try the old link in a third window: it must say it expired or was turned off. Typing from the second account will only sync after step G (viewer mode) and I (cursors) are built, but text sync itself already works. Done when: all four behave.

### Step G: Viewer and removed states

- [x] **G1. Viewer mode.** `Editor` gets `editable: false` for viewers; toolbar disabled; a slim "View only" banner. The server enforces regardless of this. Done when: a viewer cannot type or paste. **Done in code:** `Editor` takes `role`; for `"viewer"` it is `editable: false` (kept in step with the role), the toolbar buttons are disabled, and a "View only" banner shows. The server drops viewer edits regardless (D2).
- [x] **G2. Refused connection.** When the socket for a note we do not own is refused (403) or closed with 4403, show "You no longer have access to this note" with **Remove from my list**, which soft-deletes the entry and deletes that note's local IndexedDB database (`jot-note-<id>`). Done when: removing a member in one browser shows this in the other. **Done in code:** `useAccessLost` (`src/features/sharing/`) for notes someone else owns. It reacts to the server closing our socket with 4403, or, when we were away, to repeated socket failures plus the note missing from `GET /api/share/mine` (nothing is checked while offline). It then calls `stopSyncing` (the provider otherwise retries forever) and the editor shows `NoAccess` with **Remove from my list**, which soft-deletes the entry and deletes `jot-note-<id>` from this device. Headless check with a real `YProvider` and the member's cookie: removal gives a `connection-close` with code 4403, the provider keeps retrying until `disconnect()`, and the note is gone from `/mine`.
- [x] **G3. Shared notes keep their title fresh for the people they are shared with.** Today title and preview are written to the index only from local edits. For a note with `role` set, also update the entry from the doc on first sync and on remote changes while the note is open. Done when: B's list shows A's title after B opens the note. **Done in code:** the editor passes `followRemote` for shared notes (ones with a `role`, or owned with `shared`), so their title and preview also follow other people's edits, not only our own typing. `updateMeta` skips unchanged values, so nothing loops.
- [ ] **G4. Checkpoint (manual, yours): two accounts on `pnpm dev`.** (1) Owner shares a note with **Can view**; the second account opens the link: the banner says "View only", the toolbar is greyed, typing does nothing, and the owner's edits appear live. (2) Owner makes a **Can edit** link; the second account opens it (role upgrades): it can type and the owner sees it. (3) Change the first line as the owner: the second account's list shows the new title after opening the note (and the owner's list follows the editor's first-line change). (4) Owner removes the second account while it has the note open: it shows "You no longer have access" within a few seconds; **Remove from my list** drops it. (5) Remove again while the second account is closed, then open the app: opening that note shows the same message. Done when: all five behave.

### Step H0: Change a person's role (added after step G)

Today the owner can only remove someone and send a new link to lower their role. This adds a proper control in the Share dialog.

- [ ] **H0a. Server route.** `PATCH /api/share/:noteId/members/:userId` with `{ role: "editor" | "viewer" }` in `worker/share.ts`: owner only; the target must be a non-owner member (404 otherwise, 400 for the owner or a bad role); update the `note_members` row, then `kickUser(env, noteId, userId, 4401, "role changed")` so their open connections reconnect with the new role. Same `Origin` and session rules as the other routes. Done when: raising and lowering both work and a non-owner gets 403/404.
- [ ] **H0b. Selector in the Share dialog.** In `ShareDialog.tsx`, replace the plain "Can view / Can edit" text next to each person under **People with access** with a small selector (`ToggleGroup` or a native select) wired to a new `changeMemberRole(noteId, userId, role)` in `api.ts`; the Remove button stays. Disabled while a request runs; offline shows the existing "Go online" message. Done when: changing a role updates the list without reopening the dialog.
- [ ] **H0c. The other person's screen follows.** Add `setNoteRole(doc, id, role)` to `indexDoc.ts` and a `refreshRoles(doc)` helper that reads `GET /api/share/mine` and updates the `role` of any shared entry that differs. Call it when a note's socket closes with 4401 (`useAccessLost` gets an `onRoleChanged` callback) and once at startup when online (H3 uses the same read, so build them together). Done when: lowering a role while the person has the note open turns it read-only, with the "View only" banner, within a few seconds, with no reload; raising it unlocks the editor.
- [ ] **H0d. Checkpoint: headless test then manual.** Headless (as in step D): lower an editor to viewer while connected: the old socket closes with 4401, the provider reconnects, and the next edit is dropped; raise it again: the next edit lands; a non-owner calling the route gets 403/404; the owner's own row cannot be changed. Manual: two accounts, change the role in the dialog and watch the other window. Done when: both pass.

### Step H: Delete and leave

- [ ] **H1. Owner deletes a shared note.** If `shared` is set: online only (offline shows "Go online to delete a shared note"), call C6, then soft-delete as today. Done when: members are refused afterwards.
- [ ] **H2. Member "delete" means leave.** Label the action **Leave note**; call C5 on themself, then remove the entry and the local copy as in G2. Done when: the owner's member list no longer shows them.
- [ ] **H3. Prune on startup.** When online, compare the index's shared entries with `GET /api/share/mine` and mark entries we no longer have as "No access" (G2 flow). Done when: a removal made while the app was closed shows up on next open.

### Step I: Live cursors

- [ ] **I1. Awareness through `provider.ts`.** Expose the awareness of a note session so `Editor` can pass it on; no other module imports y-partyserver (CLAUDE.md). Done when: type-checks.
- [ ] **I2. `CollaborationCaret`** in the editor: name from the Google profile name (fall back to the email's local part), colour picked from a small fixed palette by hashing the user id so it is stable across devices. Style the caret and label in `src/styles`. Done when: two accounts see each other's cursor and selection.
- [ ] **I3. Checkpoint: stale cursors.** Close a tab abruptly (or turn the network off) on one side. Done when: the cursor disappears on the other side within about 30 seconds and returns on reconnect, after the Durable Object has hibernated too.

### Step J: Deploy-side setup (manual, yours)

- [ ] **J1. Google consent screen to production.** Google Cloud Console > Google Auth Platform > Audience > **Publish app**. With only the basic scopes (`openid`, `email`, `profile`) no Google review is needed, but check the page for a user cap or a verification notice and tell me what it says. Done when: the status reads **In production** and a non-test account can reach the Jot login.
- [ ] **J2. Migration and deploy.** `pnpm db:migrate:remote`, then `pnpm check && pnpm run deploy`. Done when: `/api/share/mine` answers 401 without a session on the live URL.

### Step K: Two-account test (manual)

- [ ] **K1. Real test with two Google accounts**, A on `ALLOWED_EMAILS` and B not, on two browsers or devices. **Join:** A makes a join link; B opens it, signs in, lands in an empty Jot, and can create a note. Three invited accounts fit, a fourth is refused; B cannot make a join link. **Share:** A shares a note as Can view; B opens the share link, sees the note, cannot edit. A makes a Can edit link; B accepts it (upgrades), edits, both see cursors. A shares with two people, a third is refused. A removes B: B sees "no longer has access". A turns off the link: the old link says it is no longer valid. A deletes the shared note: nobody else can open it. Also try both links on an iPhone: they open in Safari (not the installed app), and signing in there works. Done when: all pass.

### Step L: Wrap-up

- [ ] **L1. Full checks.** `pnpm check`, `pnpm build`, `pnpm exec wrangler deploy --dry-run`. Done when: all pass.
- [ ] **L2. Docs.** `docs/project-context.md`: tick Phase 6, replace the `invites (email ...)` line in §7 with `note_invites`, `user_invites` and `invited_users`, rewrite §8 for link invites, record the decisions in §12. `README.md`: sharing and join-link sections, the "In production" consent step and the new meaning of `ALLOWED_EMAILS` ("the original users, who can invite 3 more each"). `CLAUDE.md`: Never trust the client for roles, and always overwrite `x-jot-role`. Done when: no "invite by email" wording remains.
- [ ] **L3. Commit** in the split: `feat: invite links and share API` (B–D), `feat: share dialog and invite page` (E–H), `feat: live cursors` (I), `docs: update project context for phase 6` (L). Done when: the pre-commit hook passes on each.

## Details and traps

- **The role header can be forged by a client.** The guard must overwrite `x-jot-role` on every connection and never copy a client value. Same for `x-jot-user`.
- **`isReadOnly` only filters sync updates.** Awareness (cursors) from viewers is still accepted, which is fine. If A1 shows viewers can write through some other message type, close the connection instead.
- **A connection keeps the role it was opened with** (tags are fixed at connect). When a viewer is raised to editor by a second link, `accept` closes their open connections with code 4401 ("role changed") and the provider reconnects as editor; 4403 means removed and shows the no-access screen. Checked headless: viewer edit dropped, then after the edit link the connection closes with 4401, reconnects by itself, and the next edit reaches the owner.
- **Hibernation drops memory, not connection state.** Keep the role in `connection.setState`, never in a class field.
- **Do not trust the `shared` / `role` fields in the index doc for permissions.** They are UI hints only; D1 `note_members` is the truth.
- **Claim-or-member must stay race-safe** (`note_one_owner` index). Accepting an invite never touches the owner row.
- **A link token is a password.** Do not log it, do not put it in analytics, and remove it from the address bar once used (E3, E4). Observability is on in `wrangler.jsonc`, so avoid logging request URLs for `/join/` and `/share/`.
- **Link pages are SPA routes.** `/join/<token>` and `/share/<token>` are answered by the app shell, so the service worker `navigateFallbackDenylist` stays `/api/` and `/parties/` only. Do not add them to it.
- **An installed iPhone app does not catch links.** A link opened from WhatsApp opens Safari. The person signs in there; installing is optional.
- **Google callback after a link.** The callback must return to `/join/<token>` or `/share/<token>`, not `/`, otherwise the link is lost. Test with a brand-new account.
- **Local-first caveat.** Removed people keep what their device already synced (accepted, `docs/project-context.md` §8).
- **Free plan load.** One extra D1 read per connection at most; accept is one write. The cap of 3 invited users per original user and 2 other people per note bound growth.
