# Plan: Phase 2 – Offline and persistence

Status: ready, decisions made, not started
Source: `docs/project-context.md` §10 Phase 2, `docs/research/phase-1-sync.md` (server persistence sketch, limits).

Goal: a note survives a page reload, going offline, and the server restarting. Edits made offline in two tabs merge on reconnect.

## Decisions (made by owner)

| Topic            | Choice                                                                                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server storage   | **`this.ctx.storage.kv`**, one key `doc` holding `Y.encodeStateAsUpdate(...)`. No table, no migration. Lives in the DO's SQLite. Switch to a SQL table later if a room needs more than one blob (e.g. version history); copy the old key across once |
| IndexedDB name   | **`jot-note-<noteId>`**. Renaming later orphans offline data in users' browsers, so the prefix is fixed now and keeps the Phase 3 index doc from colliding                                                                                           |
| Editor rendering | **Render immediately**, no waiting for IndexedDB. Typing before it loads is safe because Yjs merges                                                                                                                                                  |

## Out of scope

Notes list and index doc (Phase 3), **users, login, auth, JWT, permissions (Phase 4)**, PWA/service worker (Phase 5), sharing (Phase 6), a "synced / offline" UI indicator (say so and it becomes a task). Phase 2 has no accounts: anyone with `?note=<id>` still reaches the room, as in Phase 1.

## Task list

Small tasks, in order. Each ends with a "done when" check, and `pnpm check` must pass after every code task. **Checkpoints** are the points to stop and test in the browser.

### Step A: Server persistence (`worker/`)

- [x] **A1. Imports and constants.** In `worker/rooms/note-room.ts` import `applyUpdate`, `encodeStateAsUpdate` from `yjs`. Add `const KEY = "doc"`. Done when: file compiles.
- [x] **A2. `onLoad`.** `const saved = this.ctx.storage.kv.get<Uint8Array>(KEY)`; if present, `applyUpdate(this.document, saved)`. Never replace the doc, only apply onto it. Done when: `pnpm check` passes.
- [x] **A3. `onSave`.** `this.ctx.storage.kv.put(KEY, encodeStateAsUpdate(this.document))`. Done when: `pnpm check` passes.
- [x] **A4. Save timing.** Add `static callbackOptions = { debounceWait: 1000, debounceMaxWait: 10000 }`. Done when: `pnpm check` passes.
- [x] **A5. Checkpoint: server restart.** Type in `/?note=test`, wait ~2 s, stop and restart `pnpm dev`, reload. Done when: the text is still there. (Local DO data lives in `.wrangler/state`.)

### Step B: Client cache (`src/sync/provider.ts`)

- [x] **B1.** Install.** `pnpm add y-indexeddb` (MIT, v9). Done when: it is in `package.json`.
- [x] **B2. Attach.** In the `useNoteSession` effect (not `createNoteSession`): `new IndexeddbPersistence(`jot-note-${noteId}`, doc)`. Created in the effect so React Strict Mode's cleanup + remount gets a live instance (a destroyed one stops saving). Only file touching sync libraries. Done when: `pnpm check` passes.
- [x] **B3. Cleanup.** The effect cleanup calls `persistence.destroy()` next to `provider.disconnect()`. Keep `disconnect()`, not `destroy()`, on the provider (partykit #402). Done when: `pnpm check` passes.
- [x] **B4. Checkpoint: cache.** Type, delete `.wrangler/state` (server copy gone), restart `pnpm dev`, reload. Done when: the text is still there. DevTools > Application > IndexedDB shows `jot-note-test`, and the text re-syncs up to the server (confirm by opening a second profile or incognito window).

### Step C: Offline merge (the phase's spec test)

- [ ] **C1. Different spots.** Two tabs on `?note=test`. DevTools > Network > Offline in both. Type in different places in each, go online. Done when: both edits are in both tabs, and a reload keeps them.
- [ ] **C2. Same spot.** Same as C1 but in the same paragraph. Done when: both tabs converge to identical text and nothing is lost (order may vary).
- [ ] **C3. Formatting offline.** Apply bold/heading in one offline tab and type in the other. Done when: both merge.
- [ ] **C4. Undo still scoped.** After a merge, `Ctrl+Z` undoes only your own edits. Done when: the other tab's text stays.

### Step D: Wrap-up

- [ ] **D1. Full checks.** `pnpm check`, `pnpm build`, `pnpm exec wrangler deploy --dry-run`. Done when: all pass.
- [ ] **D2. Docs.** Tick the Phase 2 boxes in `docs/project-context.md` and note the KV key, the `jot-note-` prefix, and "render immediately". Done when: nothing in the file still calls persistence future work.
- [ ] **D3. Commit** as `feat: persist NoteRoom state in DO storage` (A), `feat: y-indexeddb offline cache` (B), `docs: update project context for phase 2` (D). Done when: the pre-commit hook passes on each.

## Details and traps

- **Never `fetch` note data.** IndexedDB is the local source; the socket is only sync (CLAUDE.md rule 2). The editor needs no loading state.
- **`onSave` stores the compacted state**, not an update log. One value per room; the 8 MB per-value limit is far away for text notes.
- **No wrangler change** and no new migration: KV on a SQLite-backed DO needs neither. Never edit migration `v1`.
- **Free quota:** each `onSave` is one row write (100,000/day); the 1–10 s debounce keeps that tiny. Partykit #427 (save timer blocks hibernation while typing) still applies and is accepted.
- **Data-loss rule:** `onLoad` must only `applyUpdate` onto the existing doc. Replacing it with an empty one would erase the note on the next save.
- **Clearing site data** wipes IndexedDB; the server copy re-syncs on the next visit. That is why both layers exist.
- **Test offline in DevTools,** not by killing the server: a page cannot reload with no server until the PWA (Phase 5).
