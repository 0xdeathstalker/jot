# Plan: Action Panel (Raycast Notes style, Ctrl/⌘+K)

Status (2026-11-28): **phases 1–4 done.** Phase 5 decided (no sidebar), not started.

Goal: a searchable list of every action for the open note, like the Raycast Notes Action Panel,
and (phase 5) one top bar on every platform in place of the sidebar.
Each row shows its keyboard shortcut and groups are split by separators. Today Ctrl/⌘+K and
Ctrl/⌘+P both open the note switcher (`app.tsx:188-202`). Context §12 leaves "Command palette"
undecided and says it should grow out of the switcher. `editor-blocks.md` keeps ⌘K free for it.

## Decisions (owner, 2026-11-27)

| Topic                | Choice                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keys                 | **Ctrl/⌘+K opens the Action Panel**. Ctrl/⌘+P stays as the note switcher ("Browse Notes")                                                         |
| Platforms            | **Everywhere**: desktop window, web and PWA. Desktop-only rows are hidden elsewhere                                                               |
| New features         | **Recently Deleted + restore**, **Delete All Notes**, **Invite row**                                                                              |
| Sidebar (2026-11-28) | **Removed.** One top bar everywhere. Sign Out and Dark/Light move into the panel (group 4). The signed-in details and the ⋮ note menu are dropped |
| Out of scope         | Duplicate Note, Zoom In/Out, Send to AI Chat, a settings page, purging deleted notes after N days                                                 |

## Actions (v1)

| Group | Action                                                  | Keys                         | Handler                                                                                                                                                   |
| ----- | ------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | New Note                                                | Mod+N (desktop only, as now) | `handleNew` (`app.tsx`)                                                                                                                                   |
| 1     | Pin / Unpin Note (label follows state)                  | Mod+Shift+P                  | `togglePin` (`sync/index-doc.ts`)                                                                                                                         |
| 1     | Share Note…                                             | none                         | `noteActions.onShare`                                                                                                                                     |
| 1     | Browse Notes                                            | Mod+P                        | `setSwitcherOpen(true)`                                                                                                                                   |
| 1     | Go Back / Go Forward                                    | Mod+[ / Mod+]                | `history.back()` / `history.forward()`. Disabled when `navigation?.canGoBack` / `canGoForward` is false. If the Navigation API is missing, always enabled |
| 2     | Global Hotkey… (desktop only)                           | none                         | opens the existing `desktop/hotkey-dialog.tsx`                                                                                                            |
| 2     | Invite a Friend… (hidden for invited users and offline) | none                         | `InviteDialog` (`features/sharing/invite-friend.tsx`)                                                                                                     |
| 3     | Show Recently Deleted Notes                             | none                         | new dialog (below)                                                                                                                                        |
| 3     | Delete Note (destructive)                               | Mod+D                        | `handleDelete`, which already has the confirm for shared notes                                                                                            |
| 3     | Delete All Notes (destructive)                          | Mod+Alt+D                    | new confirm (below)                                                                                                                                       |
| 4     | Dark Mode / Light Mode (phase 5)                        | none                         | `useTheme` (`hooks/use-theme.ts`)                                                                                                                         |
| 4     | Sign Out (destructive, phase 5)                         | none                         | moved from `auth/account-footer.tsx`                                                                                                                      |

Pin, Share and Delete Note are hidden when no note is open or the note is an untouched draft.
They act on the open note only: phase 5 removes the ⋮ menu that acted on any note.

## Phases

Each phase ends in a working app and can be committed by itself. Do them in order: 2 builds on
the action list from 1, and 3 and 4 add rows to it.

### Phase 1: Action list and shortcuts

Goal: every action has a working shortcut, and all shortcuts come from one list. There is no
panel yet. Mod+K still opens the switcher.

- [x] **1.1** Add an `Action` type (`hooks/use-action-shortcuts.ts`, with the shortcut hook; matcher `matchesShortcut` in `lib/platform.ts`):
      `{ id, label, icon, keys?, group, destructive?, disabled?, hidden?, run }`. `keys` uses the
      `["Mod", "Shift", "P"]` format of `shortcutKeys` / `formatShortcut` (`lib/platform.ts`).
- [x] **1.2** Build the list in `app.tsx` from the handlers that already exist:
  - New Note
  - Pin / Unpin Note
  - Share Note…
  - Browse Notes
  - Go Back / Go Forward
  - Delete Note
- [x] **1.3** Pin, Share and Delete Note are `hidden` when no note is open or the note is an
      untouched draft. Pin's label follows the note's `pinned` state.
- [x] **1.4** Back and Forward call `history.back()` / `history.forward()`.
  - `disabled` comes from `navigation?.canGoBack` / `canGoForward`.
  - If the Navigation API is missing, they are always enabled.
  - Check that the existing `popstate` subscription in `use-note-id.ts` opens the right note.
- [x] **1.5** Replace the hard-coded p/k/n checks in the keydown handler (`app.tsx`) with a loop
      over the list.
  - The match compares `event.key` (lowercase) and the modifier flags exactly.
  - Skip events that are `defaultPrevented` or come from rows that are `hidden` or `disabled`.
  - Ctrl+N keeps its `isDesktop()` guard, because browsers reserve it.
- [x] **1.6** Check that the new keys do not clash with editor keys (`editor/toolbar.tsx`, the
      link box's Mod+L, the sidebar's Mod+B): Mod+Shift+P, Mod+[, Mod+], Mod+D. Also check that
      the browser lets the page take each key (Mod+D is "bookmark" in Chrome).

Check: `pnpm check`. Every shortcut works in `pnpm dev` and `pnpm desktop:dev`, and Ctrl+B and
Ctrl+L still work inside the editor.

### Phase 2: The panel and its triggers

Goal: Mod+K opens the Action Panel on every platform.

- [x] **2.1** Create `features/notes/action-panel.tsx`. It copies the `note-switcher.tsx`
      combobox:
  - `Dialog` with the blur overlay and `desktop:top-12`
  - input with `role=combobox` and `aria-activedescendant`
  - arrow keys and Enter, plus `closeThen` and `finalFocus`
  - placeholder "Search for actions…"
  - a `ponytail:` comment noting this is a second copy of the combobox: extract a shared one if
    a third appears
- [x] **2.2** Rows:
  - an icon, a label and `Kbd size="sm"` keycaps (the `editor/toolbar.tsx` menu pattern)
  - destructive rows use `text-destructive`
  - disabled rows are dimmed, and the arrow keys skip them
  - hidden rows are not listed
- [x] **2.3** Search filters rows with a case-insensitive `label.includes(query)`. A `Separator`
      sits between groups, shown only while the query is empty. Show "No actions found" when
      nothing matches.
- [x] **2.4** In `app.tsx`, add an `actionsOpen` state and mount the panel. Mod+K opens it (a
      row in the action list), and Browse Notes takes Mod+P alone.
- [x] **2.5** Desktop trigger, in `desktop/title-bar.tsx`:
  - A new `onActions` prop, plus an icon button titled `Actions (Mod+K)`. It goes on the left,
    before New, as in Raycast.
  - The Search button's hint changes to `Mod+P`.
  - The title goes from `inset-x-32` to `inset-x-40`, so it stays centred and clear of four
    buttons.
- [x] **2.6** Web trigger: a ghost icon button next to `SidebarToggle` in the `desktop:hidden`
      container (`app.tsx`), so phones (no keyboard) can reach the panel.
- [x] **2.7** Owner (2026-11-27): no window growing. On desktop the switcher and the panel are
      sized to fit the smallest window (380×320): 340px wide, 40px input, 212px list.
      `desktop/window.ts` (`growWindowTo`) is deleted. Then every dialog on desktop: 340px wide,
      16px padding and gap, at most the window height less 32px (scrolls), set once in
      `components/ui/dialog.tsx` and `alert-dialog.tsx`.
- [x] **2.8** Global Hotkey… row (group 2, desktop only): it opens the existing
      `desktop/hotkey-dialog.tsx`, mounted a second time in `app.tsx` (lazy, own open state) rather
      than lifting the gear menu's state out of `auth/account-footer.tsx`. Rows that open a dialog
      set `dialog: true`, so the panel leaves focus to it on close.

Check:

- `pnpm check`.
- Ctrl+K opens the panel, and typing "del" filters it.
- The arrow keys skip disabled rows, Enter runs the action, and Esc puts focus back in the
  editor.
- Share and Delete open their own dialogs without stacking on the panel.
- On a short desktop window the panel is not clipped.
- At phone width on the web, the trigger button opens the panel.

### Phase 3: Recently Deleted and Invite

Goal: a soft-deleted note can be found and brought back; friends can be invited from the panel.

- [x] **3.1** `sync/index-doc.ts`: add `readDeletedNotes(doc)`.
  - It returns notes with `deleted: true`, own notes only (no `role`, not `noAccess`), newest
    `updatedAt` first.
  - Pull the row-building code out of `readNotes` so both readers share it.
  - Add a hook or store next to the one `readNotes` uses, so the list updates live.
- [x] **3.2** `sync/index-doc.ts`: add `undelete(doc, id)`, which sets `deleted` back to false. It
      is named this way because `restoreNote` already exists for something else.
- [x] **3.3** Check that content survives a soft delete. The note's Y.Doc should stay in
      IndexedDB and on the server: only `handleRemoveLost` calls `deleteLocalNote`, and those
      notes are filtered out in 3.1. Open a restored note on a second device or a fresh profile.
- [x] **3.4** Create `features/notes/deleted-notes-dialog.tsx`.
  - It lists each note's title, preview and deleted date, with a Restore button.
  - Restore runs `undelete`, closes the dialog, then calls `openNote(id)`.
  - Show an empty state: "No deleted notes".
- [x] **3.5** Add a Show Recently Deleted Notes row (group 3) that opens the dialog
      (`dialog: true`). It fits the smallest window like every dialog (2.7).
- [x] **3.6** Invite a Friend… row (owner, 2026-11-27), group 2:
  - Today the dialog is opened only by its own `DialogTrigger` in `features/sharing/invite-friend.tsx`
    (sidebar account area), with local `open` state.
  - Make the dialog controllable (`open` / `onOpenChange` props) and lift its state to `app.tsx`, so
    the sidebar button and the panel row open the same dialog.
  - The row is `hidden` when the user cannot invite. That covers invited users (the server answers 403) and offline. Reuse the `getJoinInfo` result the sidebar already fetches, not a second
    fetch.
  - `dialog: true`, so the panel leaves focus to it.

Done as (2026-11-28):

- `softDelete` also writes `deletedAt`, which the list sorts by. Notes deleted earlier fall back to
  `updatedAt` and show "Edited …" instead of "Deleted …".
- `undelete` also clears `shared`: deleting a shared note revoked its links first.
- `useDeletedNotes(doc)` sits next to `useNotes`, and both use one `createStore(doc, read)`.
- The dialog mounts only while open.
- `timeAgo` moved to `lib/time-ago.ts`.
- Invites:
  - `hooks/use-join-info.ts` fetches as before (on mount, and on each dialog open).
  - `invite-friend.tsx` is split into `InviteButton` (sidebar) and `InviteDialog` (`app.tsx`).
  - The info reaches the button through `NotesSidebar` and `AccountFooter`.
- 3.3 was checked in the code: only drafts and lost shared notes call `deleteLocalNote`, and the
  Worker never acts on `deleted`. The two-device check is still to do.

Check:

- Delete a note, restore it, and its content comes back.
- With two tabs, one of them offline, the restore syncs once that tab reconnects.
- Never hard-delete.
- Invite a Friend… from the panel and from the sidebar both open the same dialog. The row is
  missing for an invited user.

### Phase 4: Delete All Notes

Goal: clear the list in one step, with everything still restorable from Phase 3.

- [x] **4.1** Add an `AlertDialog` in `app.tsx`: "Delete all N notes? Recently Deleted can bring
      them back. Shared notes are kept." N counts only the notes it will delete.
- [x] **4.2** On confirm, call `softDelete` on every own, unshared note inside one
      `doc.transact`, then `openNote(null, { replace: true })`.
  - Skip shared notes and notes shared with you. Each one needs a server call and its own
    confirm.
  - Clear any open draft.
- [x] **4.3** Add a Delete All Notes row (group 3, destructive, Mod+Alt+D). It is disabled when
      there is nothing to delete.

Done as (2026-11-28): `softDeleteAll(doc, ids)` in `sync/index-doc.ts` (one transaction). The confirm keeps its count while it closes. If the open note was deleted, or is an untouched draft, `openNote(null)` opens the next one (the draft's empty local copy is dropped as usual). A kept shared note stays open.

Check: Delete All removes your own notes and keeps the shared ones. Every deleted note shows up
in Recently Deleted and can be restored.

### Phase 5: One top bar everywhere, no sidebar

Goal (owner, 2026-11-28): web, PWA and desktop all get the same top bar, with Actions, New note,
Search notes and the open note's title. The sidebar is removed completely. The note switcher
(Ctrl/⌘+P) becomes the only way to see the note list.

#### What the sidebar does that the panel does not, and where it goes (owner, 2026-11-28)

| #   | Sidebar feature                                                                   | Decision                                                                                                                                            |
| --- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | **Sign out**, with the "N notes are not synced" confirm and the "Syncing…" status | **Sign Out** row in the panel, in its own group (group 4, destructive). The confirm comes along. While it syncs, the notice toast says "Syncing…"   |
| G2  | **Dark / light mode** switch (gear menu)                                          | **Dark Mode / Light Mode** row in group 4. The label names the mode it switches to                                                                  |
| G3  | **Who is signed in**: avatar, plus name and email on hover                        | **Dropped.** Shown nowhere                                                                                                                          |
| G4  | Another note's ⋮ menu (pin, share, delete without opening it)                     | **Removed**, the switcher's ⋮ too. The panel acts on the open note: open the note (Ctrl/⌘+P, Enter), then Ctrl/⌘+K. Ctrl/⌘+K always means the panel |

Why G4 is removed: the panel already has every ⋮ item for the open note. That covers Pin / Unpin, Share
(hidden on notes shared with you) and Delete / Leave (with the same confirm). Lists are small, so
opening a note first is cheap. It also leaves no keyboard-reach problem and no second meaning for
Ctrl/⌘+K. A note you lost access to can still be removed: open it, then Delete / Leave.

Weaker, but still reachable (accepted):

| #   | Feature                                                                                                  | After removal                                                               |
| --- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| W1  | Note list always on screen: pinned first, badges, "Current", edited time, characters, a loading skeleton | Same rows in the switcher, but only when it is opened, and with no skeleton |
| W2  | Invites left ("n left") always on screen                                                                 | Shown only inside the invite dialog (Invite a Friend… row)                  |
| W3  | Search box always on screen                                                                              | Search button / Ctrl/⌘+P                                                    |
| W4  | Phone: edge swipe opens the list (`components/ui/sidebar.tsx`, `docs/plans/sidebar-edge-swipe.md`)       | No gesture. The top bar's Search button instead                             |
| W5  | Ctrl/⌘+B and the toggle buttons                                                                          | Gone: nothing to toggle. Ctrl/⌘+B is then only Bold                         |
| W6  | Empty state "Create one with 'New note'" points at the sidebar button                                    | Reword to point at the top bar                                              |

#### Sub-tasks

- [ ] **5.1** Panel rows for G1 and G2, before the sidebar goes, so nothing is lost on the way:
  - Group 4 (last; a separator above it).
  - **Dark Mode / Light Mode**, with the icon following the label: `useTheme` (`hooks/use-theme.ts`).
  - **Sign Out** (destructive, `dialog: true` when the confirm shows). Move `handleSignOut`, the
    unsynced `AlertDialog` and the "Syncing…" state out of `auth/account-footer.tsx` into
    `app.tsx`. They use `syncAllLocalData` (`sync/provider.ts`) and `signOut`
    (`hooks/use-auth-user.ts`). "Syncing…" goes through the existing `NoticeToast`.
- [ ] **5.2** Remove the ⋮ menu (G4):
  - Drop the `NoteActions` button from the switcher's rows (`note-switcher.tsx`), along with its
    `onTogglePin` / `onShare` / `onDelete` props.
  - Delete `NoteActions` and `NoteActionHandlers` from `note-list.tsx`.
  - The switcher row becomes a plain option.
- [ ] **5.3** Make the top bar shared: `features/notes/top-bar.tsx`.
  - It holds Actions, New note, Search notes and the centred title. Hints are Mod+K / Mod+N
    (desktop) / Mod+P.
  - `desktop/title-bar.tsx` keeps only what needs Tauri: the drag region and the Minimize / Close
    buttons, wrapped around the shared bar.
- [ ] **5.4** Web and PWA:
  - Mount the top bar in `app.tsx` instead of the floating `SidebarToggle` + Actions container.
  - Respect `env(safe-area-inset-top)` on iPhone, and stay sticky above the editor.
  - Check that the editor toolbar sits at the bottom on phones and does not clash with it.
- [ ] **5.5** Remove the sidebar:
  - In `app.tsx`: `SidebarProvider` / `SidebarInset` and the `sidebar_state` cookie.
  - Delete:
    - `features/notes/notes-sidebar.tsx`
    - `features/notes/sidebar-toggle.tsx`
    - `auth/account-footer.tsx` (after 5.1; that drops the second `HotkeyDialog` mount too)
    - `InviteButton` in `features/sharing/invite-friend.tsx`, and the `invite` / `onInvite` props
      it needed
  - `features/notes/note-list.tsx` keeps only `NoteRowText`, the switcher's row. Move it next to
    the switcher if nothing else is left in the file.
- [ ] **5.6** Delete code nothing else uses any more. Check each with grep first:
  - `components/ui/sidebar.tsx`, `sheet.tsx`, `skeleton.tsx`, `tooltip.tsx`
  - `hooks/use-mobile.ts`
  - the `sidebar-*` CSS variables in `styles/index.css`
  - Mark `docs/plans/sidebar-*.md` as superseded.
- [ ] **5.7** Editor layout without the sidebar: center the writing column with `max-w-3xl` at
      every width, keep the tighter desktop padding, and reword the empty state (W6).

Check:

- Web, phone PWA and desktop each show the same top bar.
- New note, Search and Actions work from the bar and from the keys.
- Dark/Light mode and Sign Out work from the panel, including the unsynced confirm.
- The switcher has no ⋮ button, and Ctrl/⌘+K from the switcher opens the panel.
- `pnpm build && pnpm preview`: offline start still works (the service worker precache shrank,
  never grew past 2 MiB).

### Phase 6: Docs

- [ ] **6.1** `project-context.md`:
  - In §12, mark "Command palette" as Decided, with the keys and the date.
  - In the §12 desktop app row, change the switcher key to Ctrl+P.
  - In §12, record that the sidebar was removed (2026-11-28) and the top bar is shared.
- [ ] **6.2** `project-context.md` §10: add ticked items for the Action Panel, Recently Deleted,
      Delete All and the shared top bar.
- [ ] **6.3** `desktop-app.md` 3.5: switcher keys are now Ctrl/⌘+P, and Ctrl/⌘+K opens the Action
      Panel.
- [ ] **6.4** Set this plan's status to done.

## Files

- `app/src/app.tsx`: the action list, the keydown handler, the panel, the deleted-notes dialog,
  the delete-all confirm, the top bar mount; sidebar removed (phase 5)
- `app/src/features/notes/action-panel.tsx` (new)
- `app/src/features/notes/deleted-notes-dialog.tsx` (new)
- `app/src/sync/index-doc.ts`: `readDeletedNotes`, `undelete`
- `app/src/desktop/title-bar.tsx`: the Actions button and the Search hint; wraps the shared bar (phase 5)
- `app/src/features/notes/top-bar.tsx` (new, phase 5)

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
5. Shrink the desktop window to 380×320: every dialog fits without the window growing.
6. At phone width on the web, the trigger button opens the panel.
