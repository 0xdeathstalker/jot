# Plan: Phase 3 – Notes list

Status: ready, decisions made, not started
Source: `docs/project-context.md` §7 (data model), §10 Phase 3, `docs/plans/phase-1-sync.md` ("Changing the room naming later").

Goal: a sidebar lists all your notes, synced across devices and usable offline. You can create a note, pin it, soft-delete it, and search it. The list lives in one per-user "index" Y.Doc, separate from the note bodies.

## Decisions (made by owner)

| Topic                | Choice                                                                                                                                                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Index room name      | **Fixed placeholder `index-default`.** Syncs across your devices now. No users exist until Phase 4, which copies it into `index-<userId>` and retires the old room. Until then anyone with the URL can reach it, as with notes today                 |
| Index Durable Object | **New `IndexRoom` class** (party `index-room`), wrangler migration tag `v2`. Clean split from `NoteRoom` for Phase 4/6 permissions. Implemented as `class IndexRoom extends NoteRoom {}` so persistence is not duplicated                            |
| Note title           | **First line of the note**, written to the index doc by the editor (debounced). No title input. Consequence: there is no separate "rename" action, so renaming is editing the first line. The "rename" item in the Phase 3 checklist is met this way |
| Search scope         | **Title + short preview** (first ~200 chars, stored as `preview` in the index). MiniSearch, instant, never loads every note's Y.Doc. It will not find words deep inside long notes                                                                   |

Defaults I chose without asking (change them if you disagree): URL stays `?note=<id>` with `history.pushState` (no router package); no note in the URL opens the newest note, and an empty list shows an empty state (no auto-created welcome note, so two fresh devices don't each create one); no Trash or restore screen yet.

## Out of scope

Auth and per-user index naming (Phase 4), PWA/offline app shell (Phase 5), sharing and "Shared with me" (Phase 6), Trash/restore UI, tags/folders, drag-to-reorder, full-text search over note bodies, keyboard shortcuts, a router package.

## Data model (index doc)

One `Y.Map` named `notes` in the index Y.Doc, keyed by note id (`crypto.randomUUID()`):

```ts
type NoteMeta = {
  title: string // first line, "" until the user types
  preview: string // first ~200 chars of plain text
  createdAt: number
  updatedAt: number
  pinned: boolean
  deleted: boolean // soft delete only: never remove the key
}
```

Each note is one nested `Y.Map` (not a plain object) so two devices editing different fields of the same note, e.g. pin on one and title on the other, both survive. A note's body stays in its own Y.Doc under `/parties/note-room/<noteId>`.

## Task list

Small tasks, in order. Each ends with a "done when" check, and `pnpm check` must pass after every code task. **Checkpoints** are the points to stop and test.

### Step A: Server – IndexRoom (`worker/`, `wrangler.jsonc`)

- [ ] **A1. Class.** Create `worker/rooms/index-room.ts`: `import { NoteRoom } from "./note-room.ts"` and `export class IndexRoom extends NoteRoom {}` with a one-line comment (same persistence, separate Durable Object namespace). Done when: file compiles.
- [ ] **A2. Binding and migration.** In `wrangler.jsonc` add binding `{ "name": "IndexRoom", "class_name": "IndexRoom" }` and a **new** migration `{ "tag": "v2", "new_sqlite_classes": ["IndexRoom"] }`. Never edit `v1`. Done when: both are in the file.
- [ ] **A3. Export and typegen.** `export { IndexRoom } from "./rooms/index-room.ts"` in `worker/index.ts`, then `pnpm cf-typegen`. Done when: `pnpm check` passes.
- [ ] **A4. Checkpoint: dry run.** `pnpm build` then `pnpm exec wrangler deploy --dry-run`. Done when: both `NoteRoom` and `IndexRoom` bindings are listed.

### Step B: Client sync layer (`src/sync/`)

- [ ] **B1. Generalize the session hook.** In `src/sync/provider.ts` turn `createNoteSession`/`useNoteSession` into one internal `useRoomSession({ party, room, idbName })`, and keep `useNoteSession(noteId)` as a thin wrapper (`party: "note-room"`, `idbName: jot-note-${noteId}`). Same cleanup rules as Phase 2 (create IndexedDB persistence in the effect, `disconnect()` not `destroy()` on the provider). Done when: the editor still syncs and `pnpm check` passes.
- [ ] **B2. Index session.** Add `useIndexSession()` in the same file: `party: "index-room"`, `room: "index-default"`, `idbName: "jot-index-default"`. These two names are permanent; renaming orphans data. Done when: `pnpm check` passes.
- [ ] **B3. Index store.** Create `src/sync/indexDoc.ts` with the `NoteMeta` type, helpers `createNote()`, `updateMeta(id, { title, preview })`, `togglePin(id)`, `softDelete(id)`, and a `useNotes()` hook that returns the list as a stable array through `useSyncExternalStore` plus `observeDeep` (cache the snapshot; a new array on every call causes an infinite render loop). Sorting: pinned first, then `updatedAt` descending; `deleted: true` entries are filtered out of the list. No import of `y-partyserver` here. Done when: `pnpm check` passes.
- [ ] **B4. Checkpoint: index sync (headless).** Node script with two clients on `index-default` (BroadcastChannel off): client A creates a note, client B sees it; both go offline, A pins, B changes the title of the same note, reconnect; both fields survive. Done when: the script prints PASS.

### Step C: App shell and navigation

- [ ] **C1. Current note id.** `useNoteId()` in `src/features/notes/`: reads `?note=` (same `^[\w-]{1,64}$` check as today), exposes `openNote(id)` using `history.pushState`, and listens to `popstate`. Replaces `getNoteId()` in `App.tsx`. Done when: back/forward changes the open note.
- [ ] **C2. Layout.** `App.tsx`: sidebar on the left (`aside`), editor on the right, fixed width on desktop. On narrow screens the sidebar is a toggled panel (a plain button, no sheet component). Keep `<Editor key={noteId} />`. Done when: both render side by side.
- [ ] **C3. New note.** A "New note" button calls `createNote()` and `openNote(id)`. The id comes from `crypto.randomUUID()`. Done when: the click opens an empty editor and a row appears in the list.
- [ ] **C4. Opening and empty states.** No `?note=`: open the newest note; empty list: show a short empty state with the New note button. A `?note=` id missing from the index (e.g. the old `test` note) still opens. Done when: all three cases behave.

### Step D: Sidebar list (`src/features/notes/`)

- [ ] **D1. shadcn parts.** `pnpm dlx shadcn@latest add input scroll-area dropdown-menu`. Done when: files exist under `src/components/ui/`; do not hand-edit them.
- [ ] **D2. List item.** `NoteList` and `NoteItem`: title (or "Untitled" when empty), one-line preview, current note highlighted, click opens it. Done when: rows render from `useNotes()`.
- [ ] **D3. Actions.** Per-row menu (dropdown) with Pin/Unpin and Delete; pinned rows show a pin icon. Delete calls `softDelete` only and never removes the Y.Map key. If the open note is deleted, open the next one or the empty state. Done when: both actions work and survive a reload.
- [ ] **D4. No `fetch` in `src/features/notes/`.** The lint rule already enforces it. Done when: `pnpm lint` is clean.

### Step E: Title and preview from the editor

- [ ] **E1. Helper.** Pure function `getTitleAndPreview(editor.getText())`: title = first non-empty line, trimmed, max 100 chars; preview = text after the title, whitespace collapsed, first 200 chars. Done when: a tiny self-check script or `demo()` covers an empty doc, a one-line doc and a long doc.
- [ ] **E2. Write on local edits only.** In `Editor.tsx` use `onUpdate`, **debounced ~500 ms**, skip transactions that came from Yjs (`isChangeOrigin` from `@tiptap/y-tiptap`) so remote edits do not echo, and skip the write when title and preview are unchanged. Also bump `updatedAt` when it writes. Done when: typing updates the sidebar row and a remote-only change causes no index write.
- [ ] **E3. Checkpoint: two tabs.** Tab A types a first line; tab B's sidebar row shows it. Done when: it appears in under ~2 s.

### Step F: Search

- [ ] **F1. Install.** `pnpm add minisearch` (MIT, no dependencies). Done when: it is in `package.json`.
- [ ] **F2. Hook.** `useNoteSearch(notes, query)` in `src/features/notes/`: build a MiniSearch index over `title` (boost 2) and `preview`, with `prefix: true` and `fuzzy: 0.2`, rebuilt with `useMemo` when the notes array changes (small, so no incremental updates). Empty query returns the full sorted list. Done when: it returns ranked ids.
- [ ] **F3. Wire it.** Search `Input` above the list, filtering the rows live. Pinned-first order applies only when the query is empty; with a query, rank order wins. Done when: typing narrows the list instantly and clearing restores it.

### Step G: Wrap-up

- [ ] **G1. Checkpoint: cross-device and offline (manual).** Two browsers (one normal, one incognito, so they share nothing but the server): create a note in one, it appears in the other; take one offline (stop `pnpm dev`), create and pin there, restart, both agree; soft-delete in one, it disappears in the other and stays out after a reload. Done when: all pass.
- [ ] **G2. Full checks.** `pnpm check`, `pnpm build`, `pnpm exec wrangler deploy --dry-run`. Done when: all pass.
- [ ] **G3. Docs.** Tick Phase 3 in `docs/project-context.md`; record the `index-default` placeholder and its Phase 4 migration, the `IndexRoom`/`v2` choice, first-line titles (so no rename action), and `?note=` navigation. Update §7 (index room name no longer TBD). Done when: no "TBD" index naming remains.
- [ ] **G4. Commit** in the split: `feat: IndexRoom durable object` (A), `feat: index doc store` (B), `feat: notes sidebar` (C–D), `feat: title/preview sync and search` (E–F), `docs: update project context for phase 3`. Done when: the pre-commit hook passes on each.

## Details and traps

- **Plain object vs `Y.Map` per note:** use a nested `Y.Map` per note. If a whole object is replaced on every edit, concurrent edits on different fields overwrite each other.
- **Snapshot identity:** `useSyncExternalStore` needs a stable snapshot. Recompute the array only inside the `observeDeep` callback and store it; never build it inside the `getSnapshot` function.
- **Echo loop:** the editor's `onUpdate` also fires for remote edits. Writing to the index on those makes every device rewrite the same value forever. Gate on `isChangeOrigin` and on "value unchanged".
- **Free-plan writes:** one index write per debounce window per active editor, plus one DO save (1–10 s debounce). A busy day stays far below 100,000 row writes.
- **Never hard-delete.** `deleted: true` only (CLAUDE.md "Never"). An offline device would resurrect a removed key.
- **Orphaned bodies:** a soft-deleted note's body stays in its own DO. Cleanup is a later concern, not Phase 3.
- **Index room name is permanent once real notes exist.** `index-default` and `jot-index-default` get migrated by Phase 4 (read the old doc, write into `index-<userId>`), not renamed in place.
- **Pre-auth exposure:** until Phase 4 anyone who learns the room name can read or edit the index. Acceptable for a personal dev build; do not share the deployed URL before Phase 4.
- **Migration `v2` is append-only.** After deploying it, never edit it; later class changes get `v3`.
