# Plan: Action Panel (Raycast Notes style, Ctrl/⌘+K)

Status (2026-11-27): **planned.**

Goal: a searchable list of every action for the open note, like the Raycast Notes Action Panel.
Each row shows its keyboard shortcut and groups are split by separators. Today Ctrl/⌘+K and
Ctrl/⌘+P both open the note switcher (`app.tsx:188-202`). Context §12 leaves "Command palette"
undecided and says it should grow out of the switcher. `editor-blocks.md` keeps ⌘K free for it.

## Decisions (owner, 2026-11-27)

| Topic        | Choice                                                                                            |
| ------------ | ------------------------------------------------------------------------------------------------- |
| Keys         | **Ctrl/⌘+K opens the Action Panel**. Ctrl/⌘+P stays as the note switcher ("Browse Notes")         |
| Platforms    | **Everywhere**: desktop window, web and PWA. Desktop-only rows are hidden elsewhere               |
| New features | **Recently Deleted + restore** and **Delete All Notes**                                           |
| Out of scope | Duplicate Note, Zoom In/Out, Send to AI Chat, a settings page, purging deleted notes after N days |

## Actions (v1)

| Group | Action                                 | Keys                         | Handler                                                                                                                                                   |
| ----- | -------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | New Note                               | Mod+N (desktop only, as now) | `handleNew` (`app.tsx`)                                                                                                                                   |
| 1     | Pin / Unpin Note (label follows state) | Mod+Shift+P                  | `togglePin` (`sync/index-doc.ts`)                                                                                                                         |
| 1     | Share Note…                            | none                         | `noteActions.onShare`                                                                                                                                     |
| 1     | Browse Notes                           | Mod+P                        | `setSwitcherOpen(true)`                                                                                                                                   |
| 1     | Go Back / Go Forward                   | Mod+[ / Mod+]                | `history.back()` / `history.forward()`. Disabled when `navigation?.canGoBack` / `canGoForward` is false. If the Navigation API is missing, always enabled |
| 2     | Global Hotkey… (desktop only)          | none                         | opens the existing `desktop/hotkey-dialog.tsx`                                                                                                            |
| 3     | Show Recently Deleted Notes            | none                         | new dialog (below)                                                                                                                                        |
| 3     | Delete Note (destructive)              | Mod+D                        | `handleDelete`, which already has the confirm for shared notes                                                                                            |
| 3     | Delete All Notes (destructive)         | Mod+Alt+D                    | new confirm (below)                                                                                                                                       |

Pin, Share and Delete Note are hidden when no note is open or the note is an untouched draft.

## Phases

Each phase ends in a working app and can be committed by itself. Do them in order: 2 builds on
the action list from 1, and 3 and 4 add rows to it.

### Phase 1: Action list and shortcuts

Goal: every action has a working shortcut, and all shortcuts come from one list. There is no
panel yet. Mod+K still opens the switcher.

- [ ] **1.1** Add an `Action` type in `app.tsx`:
      `{ id, label, icon, keys?, group, destructive?, disabled?, hidden?, run }`. `keys` uses the
      `["Mod", "Shift", "P"]` format of `shortcutKeys` / `formatShortcut` (`lib/platform.ts`).
- [ ] **1.2** Build the list in `app.tsx` from the handlers that already exist:
  - New Note
  - Pin / Unpin Note
  - Share Note…
  - Browse Notes
  - Go Back / Go Forward
  - Delete Note
- [ ] **1.3** Pin, Share and Delete Note are `hidden` when no note is open or the note is an
      untouched draft. Pin's label follows the note's `pinned` state.
- [ ] **1.4** Back and Forward call `history.back()` / `history.forward()`.
  - `disabled` comes from `navigation?.canGoBack` / `canGoForward`.
  - If the Navigation API is missing, they are always enabled.
  - Check that the existing `popstate` subscription in `use-note-id.ts` opens the right note.
- [ ] **1.5** Replace the hard-coded p/k/n checks in the keydown handler (`app.tsx`) with a loop
      over the list.
  - The match compares `event.key` (lowercase) and the modifier flags exactly.
  - Skip events that are `defaultPrevented` or come from rows that are `hidden` or `disabled`.
  - Ctrl+N keeps its `isDesktop()` guard, because browsers reserve it.
- [ ] **1.6** Check that the new keys do not clash with editor keys (`editor/toolbar.tsx`, the
      link box's Mod+L, the sidebar's Mod+B): Mod+Shift+P, Mod+[, Mod+], Mod+D. Also check that
      the browser lets the page take each key (Mod+D is "bookmark" in Chrome).

Check: `pnpm check`. Every shortcut works in `pnpm dev` and `pnpm desktop:dev`, and Ctrl+B and
Ctrl+L still work inside the editor.

### Phase 2: The panel and its triggers

Goal: Mod+K opens the Action Panel on every platform.

- [ ] **2.1** Create `features/notes/action-panel.tsx`. It copies the `note-switcher.tsx`
      combobox:
  - `Dialog` with the blur overlay and `desktop:top-12`
  - input with `role=combobox` and `aria-activedescendant`
  - arrow keys and Enter, plus `closeThen` and `finalFocus`
  - placeholder "Search for actions…"
  - a `ponytail:` comment noting this is a second copy of the combobox: extract a shared one if
    a third appears
- [ ] **2.2** Rows:
  - an icon, a label and `Kbd size="sm"` keycaps (the `editor/toolbar.tsx` menu pattern)
  - destructive rows use `text-destructive`
  - disabled rows are dimmed, and the arrow keys skip them
  - hidden rows are not listed
- [ ] **2.3** Search filters rows with a case-insensitive `label.includes(query)`. A `Separator`
      sits between groups, shown only while the query is empty. Show "No actions found" when
      nothing matches.
- [ ] **2.4** In `app.tsx`, add an `actionsOpen` state and mount the panel. Mod+K opens it (a
      row in the action list), and Browse Notes takes Mod+P alone.
- [ ] **2.5** Desktop trigger, in `desktop/title-bar.tsx`:
  - A new `onActions` prop, plus an icon button titled `Actions (Mod+K)`. It goes on the left,
    before New, as in Raycast.
  - The Search button's hint changes to `Mod+P`.
  - The title goes from `inset-x-32` to `inset-x-40`, so it stays centred and clear of four
    buttons.
- [ ] **2.6** Web trigger: a ghost icon button next to `SidebarToggle` in the `desktop:hidden`
      container (`app.tsx`), so phones (no keyboard) can reach the panel.
- [ ] **2.7** The `growWindowTo(360)` effect runs on `switcherOpen || actionsOpen`, so a short
      desktop window does not clip the panel.
- [ ] **2.8** Global Hotkey… row (group 2, desktop only): it opens the existing
      `desktop/hotkey-dialog.tsx`. Lift that dialog's open state if it lives only inside the gear
      menu (`auth/account-footer.tsx`).

Check:

- `pnpm check`.
- Ctrl+K opens the panel, and typing "del" filters it.
- The arrow keys skip disabled rows, Enter runs the action, and Esc puts focus back in the
  editor.
- Share and Delete open their own dialogs without stacking on the panel.
- On a short desktop window the panel is not clipped.
- At phone width on the web, the trigger button opens the panel.

### Phase 3: Recently Deleted

Goal: a soft-deleted note can be found and brought back.

- [ ] **3.1** `sync/index-doc.ts`: add `readDeletedNotes(doc)`.
  - It returns notes with `deleted: true`, own notes only (no `role`, not `noAccess`), newest
    `updatedAt` first.
  - Pull the row-building code out of `readNotes` so both readers share it.
  - Add a hook or store next to the one `readNotes` uses, so the list updates live.
- [ ] **3.2** `sync/index-doc.ts`: add `undelete(doc, id)`, which sets `deleted` back to false. It
      is named this way because `restoreNote` already exists for something else.
- [ ] **3.3** Check that content survives a soft delete. The note's Y.Doc should stay in
      IndexedDB and on the server: only `handleRemoveLost` calls `deleteLocalNote`, and those
      notes are filtered out in 3.1. Open a restored note on a second device or a fresh profile.
- [ ] **3.4** Create `features/notes/deleted-notes-dialog.tsx`.
  - It lists each note's title, preview and deleted date, with a Restore button.
  - Restore runs `undelete`, closes the dialog, then calls `openNote(id)`.
  - Show an empty state: "No deleted notes".
- [ ] **3.5** Add a Show Recently Deleted Notes row (group 3) that opens the dialog. Let the
      desktop window grow for this dialog too (2.7).

Check: delete a note, restore it, and its content comes back. With two tabs, one of them offline,
the restore syncs once that tab reconnects. Never hard-delete.

### Phase 4: Delete All Notes

Goal: clear the list in one step, with everything still restorable from Phase 3.

- [ ] **4.1** Add an `AlertDialog` in `app.tsx`: "Delete all N notes? Recently Deleted can bring
      them back. Shared notes are kept." N counts only the notes it will delete.
- [ ] **4.2** On confirm, call `softDelete` on every own, unshared note inside one
      `doc.transact`, then `openNote(null, { replace: true })`.
  - Skip shared notes and notes shared with you. Each one needs a server call and its own
    confirm.
  - Clear any open draft.
- [ ] **4.3** Add a Delete All Notes row (group 3, destructive, Mod+Alt+D). It is disabled when
      there is nothing to delete.

Check: Delete All removes your own notes and keeps the shared ones. Every deleted note shows up
in Recently Deleted and can be restored.

### Phase 5: Docs

- [ ] **5.1** `project-context.md`:
  - In §12, mark "Command palette" as Decided, with the keys and the date.
  - In the §12 desktop app row, change the switcher key to Ctrl+P.
- [ ] **5.2** `project-context.md` §10: add ticked items for the Action Panel, Recently Deleted
      and Delete All.
- [ ] **5.3** `desktop-app.md` 3.5: switcher keys are now Ctrl/⌘+P, and Ctrl/⌘+K opens the Action
      Panel.
- [ ] **5.4** Set this plan's status to done.

## Files

- `app/src/app.tsx`: the action list, the keydown handler, the panel, the deleted-notes dialog,
  the delete-all confirm, the web trigger and the grow effect
- `app/src/features/notes/action-panel.tsx` (new)
- `app/src/features/notes/deleted-notes-dialog.tsx` (new)
- `app/src/sync/index-doc.ts`: `readDeletedNotes`, `undelete`
- `app/src/desktop/title-bar.tsx`: the Actions button and the Search hint

## Verification

1. `pnpm check` passes.
2. In `pnpm dev` and in `pnpm desktop:dev`:
   - Ctrl+K opens the panel. Typing "del" filters it.
   - The arrow keys skip disabled rows, Enter runs the action, and Esc puts focus back in the
     editor.
   - Each shortcut also works with the panel closed: Ctrl+P, Ctrl+Shift+P, Ctrl+[ / ], Ctrl+D,
     Ctrl+Alt+D.
   - Ctrl+B (Bold) and Ctrl+L in the editor still work.
3. Delete a note, open Recently Deleted and restore it: the content comes back. Test with two
   tabs, one offline. The restore syncs once that tab reconnects.
4. Delete All removes your own notes and keeps shared ones. Every deleted note can be restored.
5. Shrink the desktop window: the window grows, so the panel is not clipped.
6. At phone width on the web, the trigger button opens the panel.
