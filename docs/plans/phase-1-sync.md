# Plan: Phase 1 – Prove sync works

Status: draft, awaiting owner go-ahead
Source: `docs/project-context.md` §10 Phase 1.

Goal: two browser tabs on `/?note=test` stay in sync. Nothing else.

## Decisions (made by owner)

| Topic             | Choice                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Toolbar           | Own toolbar from shadcn (Base UI) components calling Tiptap commands. No Tiptap CLI/Simple Editor |
| Persistence       | **Phase 2** (`onLoad`/`onSave`). Phase 1 keeps the doc in DO memory only                          |
| Room names        | **Plain IDs**: `/parties/note-room/<id>`, no `note:` prefix. Phase 1 room is `test`               |
| Hibernation issue | Accept partykit #427 (save timer blocks hibernation only while typing). Revisit if quota matters  |

Why not the Tiptap CLI: SCSS + Radix + Floating UI, React 19 not fully supported, its undo/redo buttons conflict with Collaboration, and the npm CLI package carries Tiptap's Pro license text.

## Out of scope

`y-indexeddb`, `onLoad`/`onSave` (Phase 2); notes list, index doc, search (Phase 3); auth (Phase 4); PWA (Phase 5); cursors/awareness UI (Phase 6); link popover, images, tables.

## Changing the room naming later

Room name = Durable Object identity. Renaming later orphans data stored under the old name. It is free now (nothing is persisted), and cheap until Phase 3 creates real notes. Decide the index-doc naming (`IndexRoom` class vs `index-<userId>`) in the Phase 3 plan, before any real data exists.

## Task list

Small tasks, in order. Each one ends with a "done when" check, and leaves `pnpm check` passing from task 2.1 onwards. Step numbers point to the details below. **Checkpoints** are the points to stop and test in the browser.

### A. Server

- [x] **A1. Install packages.** `pnpm add yjs partyserver y-partyserver @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-collaboration @tiptap/y-tiptap` (step 1). Done when: install finishes, no unmet peer warnings (if `@cloudflare/workers-types` is reported, ask the owner before adding).
- [x] **A2. Regenerate Worker types.** `pnpm cf-typegen` (step 1). Done when: `worker-configuration.d.ts` still has `NoteRoom` in `Env`.
- [x] **A3. Make `NoteRoom` a `YServer` with `hibernate: true`** in `worker/rooms/note-room.ts` (step 2). Done when: `pnpm typecheck` passes.
- [x] **A4. Route party requests** in `worker/index.ts` with `routePartykitRequest`, keep the 404 fallback (step 3). Done when: `pnpm typecheck` passes and `pnpm dev` starts without errors.

### B. Client sync (no UI yet)

- [x] **B1. `src/sync/provider.ts`: create the provider.** A plain function that takes a note id and returns `{ doc, provider }` using `new YProvider(window.location.host, noteId, doc, { party: "note-room" })` (step 4). This is the only file importing `y-partyserver`. Done when: `pnpm check` passes.
- [x] **B2. Add the React hook** in the same file: creates the provider once per note id and calls `provider.disconnect()` on unmount, never `destroy()` (step 4). Done when: `pnpm check` passes.
- [x] **B3. Add reconnect listeners** in the hook: on `visibilitychange` (visible) and `window` `online`, call `provider.connect()` if `!provider.wsconnected`; remove the listeners on cleanup (step 4). Done when: `pnpm check` passes.

### C. Editor and app shell

- [x] **C1. `src/editor/editor.tsx`, minimal.** `useEditor` with `StarterKit.configure({ undoRedo: false })` and `Collaboration.configure({ document: provider.doc })`, rendered with `EditorContent`. No Tiptap `content` option (step 5). Done when: `pnpm check` passes.
- [x] **C2. `src/app.tsx`: read `?note=`**, default `test`, render `<Editor key={noteId} noteId={noteId} />` (step 6). Done when: the page loads at `/` and at `/?note=test` with no console errors.
- [x] **C3. Editor styles** on `.ProseMirror` in `src/styles/index.css`: headings, lists, blockquote, code, font size at least 16px (step 5). Done when: typing `# ` or `- ` shows styled heading or list.
- [x] **C4. Checkpoint: two-tab sync.** Run verify items 1–3 from step 8. Done when: text typed in one tab shows in the other within about a second, a WebSocket to `/parties/note-room/test` is open in both, and `?note=other` stays separate.
  - If the WebSocket gets the SPA page instead of connecting, add `run_worker_first: ["/parties/*"]` to `wrangler.jsonc` and run `pnpm cf-typegen`.

### D. Toolbar

- [x] **D1. Add the shadcn toggle.** `pnpm dlx shadcn@latest add toggle` (step 7). Done when: `src/components/ui/toggle.tsx` exists and is not hand-edited.
- [x] **D2. `src/editor/toolbar.tsx` with mark toggles:** bold, italic, strike, inline code. Active state from `editor.isActive`, `aria-label` on each (step 7). Done when: clicking bold in tab 1 formats text and shows it in tab 2.
- [x] **D3. Heading toggles** H1 and H2 via `toggleHeading({ level })`. Done when: heading toggles and syncs.
- [x] **D4. List toggles:** bullet and ordered. Done when: both toggle and sync.
- [x] **D5. Blockquote and code block toggles.** Done when: both toggle and sync.
- [x] **D6. Render `<Toolbar editor={editor} />` inside `editor.tsx`.** Done when: toolbar is visible and no undo/redo buttons exist.

### E. Wrap-up

- [x] **E1. Checkpoint: reconnect and undo.** Run verify items 4–5 from step 8. Done when: tabs recover after a `pnpm dev` restart, and `Ctrl+Z` undoes only your own text.
- [x] **E2. Full checks.** `pnpm check`, `pnpm build`, `pnpm exec wrangler deploy --dry-run`. Done when: all three pass.
- [x] **E3. Docs.** Update `docs/project-context.md` (Phase 1 boxes, §7 plain room IDs, index-doc naming deferred to Phase 3) (step 9). Done when: no `note:` room names remain in the file.
- [x] **E4. Commit** in the split from step 11. Done when: pre-commit hook passes on each commit.

Order notes: A and B can be built before any UI exists. C4 is the first real test of the whole pipeline, so fix problems there before starting D.

## Step details (reference)

### 1. Packages

```
pnpm add yjs partyserver y-partyserver @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-collaboration @tiptap/y-tiptap
pnpm cf-typegen
```

Do not add: `y-prosemirror`, `y-websocket`, `y-indexeddb`, `sass`, anything `@tiptap-pro/*`. If pnpm warns about an unmet `@cloudflare/workers-types` peer, add it as a devDependency and tell the owner.

### 2. `worker/rooms/note-room.ts`

```ts
import { YServer } from "y-partyserver"

// ponytail: in-memory only until Phase 2 adds onLoad/onSave (DO SQLite).
// Known limit: y-partyserver's save timer keeps the DO awake while typing (partykit #427).
export class NoteRoom extends YServer {
  static options = { hibernate: true }
}
```

Hibernation stays **on** (context §11 money trap).

### 3. `worker/index.ts`

```ts
import { routePartykitRequest } from "partyserver"

export { NoteRoom } from "./rooms/note-room.ts"

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (await routePartykitRequest(request, env)) || new Response("Not Found", { status: 404 })
  },
} satisfies ExportedHandler<Env>
```

Keep the `.ts` extension in the import (worker tsconfig is `nodenext`). No `run_worker_first` for now: non-navigation requests that match no asset already reach the Worker. Add `run_worker_first: ["/parties/*"]` only if the WebSocket upgrade gets the SPA page instead.

### 4. `src/sync/provider.ts` (only importer of `y-partyserver`)

Export a hook that builds one provider per note id:

```ts
// shape; adjust to the final API
new YProvider(window.location.host, noteId, doc, { party: "note-room" })
```

- `window.location.host` works in Vite dev and production (no env config).
- `party` must be `"note-room"` (kebab-case of the `NoteRoom` binding).
- Reconnect on iOS: on `document` `visibilitychange` (visible) and `window` `online`, call `provider.connect()` if `!provider.wsconnected`. Clean up listeners and call `provider.disconnect()` on unmount (not `destroy()`, partykit #402).
- Create the provider once per note id. Key the editor component by id (the provider does not re-create when `room` changes).

### 5. `src/editor/editor.tsx`

```ts
useEditor({
  extensions: [
    StarterKit.configure({ undoRedo: false }), // v3 name; Collaboration brings its own undo/redo
    Collaboration.configure({ document: provider.doc }),
  ],
})
```

- Never pass Tiptap's `content` option; content comes from the Y.Doc.
- Keep the default Collaboration `field`. It must never change once real notes exist.
- Editor typography on `.ProseMirror` in `src/styles/index.css` (Tailwind preflight strips list and heading styles): headings, lists, blockquote, code. Font size **≥ 16px** (iOS zoom trap, context §11). No new dependency (skip `@tailwindcss/typography`).

### 6. `src/app.tsx`

Read `?note=` from `window.location.search`, default `test`. Render `<Editor key={noteId} noteId={noteId} />`. No router. No spinner: the editor works before the socket connects (local-first).

### 7. `src/editor/toolbar.tsx`

Add the shadcn components needed (only what the toolbar uses):

```
pnpm dlx shadcn@latest add toggle
```

(`button` is already installed; add `separator` or `tooltip` only if used.)

Toggles call Tiptap commands and show active state via `editor.isActive(...)`:

- bold, italic, strike, inline code: `toggleBold()`, `toggleItalic()`, `toggleStrike()`, `toggleCode()`
- headings 1 and 2: `toggleHeading({ level })`
- bullet and ordered list: `toggleBulletList()`, `toggleOrderedList()`
- blockquote, code block: `toggleBlockquote()`, `toggleCodeBlock()`

Rules: `.focus().<command>().run()` on every call; icons from the installed Hugeicons; every button has an `aria-label`. **No undo/redo buttons** (keyboard shortcuts still work via Collaboration). No link UI yet.

`src/components/ui/**` is generated: do not edit or format it.

### 8. Verify (manual, two tabs)

1. `pnpm dev`, open `/?note=test` in two tabs. Typing in one appears in the other within about a second.
2. DevTools Network: a WebSocket to `/parties/note-room/test` is open in both.
3. Open `/?note=other`: it stays independent of `test`.
4. Stop and restart `pnpm dev` with tabs open: they reconnect and keep working. If a tab behaves oddly, restart dev (known workerd dev issue, workers-sdk#16491).
5. Confirm undo (`Ctrl+Z`) is one coherent history across a refresh-free session and does not undo the other tab's text.
6. Toolbar buttons toggle formatting and sync to the other tab.
7. `pnpm check` passes.

Expected and acceptable: closing all tabs and letting the DO be evicted loses the note (Phase 2 fixes this).

### 9. Docs

- `docs/project-context.md`: tick Phase 1 boxes; §7 room names become plain IDs (`/parties/note-room/<noteId>`); note the index-doc naming decision is deferred to Phase 3.
- `CLAUDE.md`: no change unless a new rule appears.

### 10. Done checklist

- [ ] Two tabs on `?note=test` sync in under about a second
- [ ] `?note=other` is isolated
- [ ] Reconnect after dev restart works
- [ ] Toolbar toggles formatting, synced across tabs
- [ ] StarterKit `undoRedo` disabled; `y-partyserver` imported only in `src/sync/provider.ts`
- [ ] `pnpm check` and `pnpm build` pass; `pnpm exec wrangler deploy --dry-run` passes
- [ ] Phase 1 boxes and §7 updated in `docs/project-context.md`

### 11. Commit (suggested split)

1. `feat: add NoteRoom YServer and party routing in worker`
2. `feat: add Tiptap editor bound to Yjs via YProvider`
3. `feat: add formatting toolbar`
4. `docs: update project context for phase 1`

## Traps

- Wrong `party` name: must be `note-room`, otherwise 400 from the router.
- Tiptap `content` option or StarterKit undo/redo left on: both break collaboration.
- Calling `provider.destroy()` in cleanup: leaks a reconnect timer (#402). Use `disconnect()`.
- Provider created per render: create once per note id.
- Hibernation turned off: one open tab would burn most of the daily free duration quota.
- Editing `src/components/ui/**`: shadcn owns it.

## Open items to confirm while building

- Whether `provider.destroy`/React Strict Mode double-mount causes two sockets in dev.
- Whether WebSocket upgrades reach the Worker without `run_worker_first` (step 3).
- Whether `@cloudflare/workers-types` peer warning appears (step 1).

## Next

`docs/plans/phase-2-persistence.md`: `y-indexeddb` on the client, `onLoad`/`onSave` into DO SQLite (fixture `tiptap-yjs` shows ~15 lines), offline test with two tabs.
