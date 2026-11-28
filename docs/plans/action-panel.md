# Plan: Action Panel (Raycast Notes style, Ctrl/⌘+K)

Status (2026-11-28): **phases 1–9 done** (9.1 and 9.5 open). Phases 10–13 (editor chrome) planned; phase 14 (docs) last.

Goal: a searchable list of every action for the open note, like the Raycast Notes Action Panel,
and (phase 5) one top bar on every platform in place of the sidebar.
Each row shows its keyboard shortcut and groups are split by separators. Today Ctrl/⌘+K and
Ctrl/⌘+P both open the note switcher (`app.tsx:188-202`). Context §12 leaves "Command palette"
undecided and says it should grow out of the switcher. `editor-blocks.md` keeps ⌘K free for it.

## Decisions (owner, 2026-11-27)

| Topic                      | Choice                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keys                       | **Ctrl/⌘+K opens the Action Panel**. Ctrl/⌘+P stays as the note switcher ("Browse Notes")                                                                                                                                                                                                                                                     |
| Platforms                  | **Everywhere**: desktop window, web and PWA. Desktop-only rows are hidden elsewhere                                                                                                                                                                                                                                                           |
| New features               | **Recently Deleted + restore**, **Delete All Notes**, **Invite row**                                                                                                                                                                                                                                                                          |
| Sidebar (2026-11-28)       | **Removed.** One top bar everywhere. Sign Out and Dark/Light move into the panel (group 4). The signed-in details and the ⋮ note menu are dropped                                                                                                                                                                                             |
| Editor chrome (2026-11-28) | Layout modes by width: **phone** (<640px) and **desktop** show the title in the top bar; **web** (≥640px, not the desktop app) puts the toolbar there. Toasts top centre in desktop, phone and PWA, bottom centre in a web tab. Delete toast: message only. Hidden toolbar remembered per device. New phone notes start with an H2 first line |
| Out of scope               | Duplicate Note, Zoom In/Out, Send to AI Chat, a settings page, purging deleted notes after N days                                                                                                                                                                                                                                             |

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

- [x] **5.1** Panel rows for G1 and G2, before the sidebar goes, so nothing is lost on the way:
  - Group 4 (last; a separator above it).
  - **Dark Mode / Light Mode**, with the icon following the label: `useTheme` (`hooks/use-theme.ts`).
  - **Sign Out** (destructive, `dialog: true` when the confirm shows). Move `handleSignOut`, the
    unsynced `AlertDialog` and the "Syncing…" state out of `auth/account-footer.tsx` into
    `app.tsx`. They use `syncAllLocalData` (`sync/provider.ts`) and `signOut`
    (`hooks/use-auth-user.ts`). "Syncing…" goes through the existing `NoticeToast`.
- [x] **5.2** Remove the ⋮ menu (G4):
  - Drop the `NoteActions` button from the switcher's rows (`note-switcher.tsx`), along with its
    `onTogglePin` / `onShare` / `onDelete` props.
  - Delete `NoteActions` and `NoteActionHandlers` from `note-list.tsx`.
  - The switcher row becomes a plain option.
- [x] **5.3** Make the top bar shared: `features/notes/top-bar.tsx`.
  - It holds Actions, New note, Search notes and the centred title. Hints are Mod+K / Mod+N
    (desktop) / Mod+P.
  - `desktop/title-bar.tsx` keeps only what needs Tauri: the drag region and the Minimize / Close
    buttons, wrapped around the shared bar.
- [x] **5.4** Web and PWA:
  - Mount the top bar in `app.tsx` instead of the floating `SidebarToggle` + Actions container.
  - Respect `env(safe-area-inset-top)` on iPhone, and stay sticky above the editor.
  - Check that the editor toolbar sits at the bottom on phones and does not clash with it.
- [x] **5.5** Remove the sidebar:
  - In `app.tsx`: `SidebarProvider` / `SidebarInset` and the `sidebar_state` cookie.
  - Delete:
    - `features/notes/notes-sidebar.tsx`
    - `features/notes/sidebar-toggle.tsx`
    - `auth/account-footer.tsx` (after 5.1; that drops the second `HotkeyDialog` mount too)
    - `InviteButton` in `features/sharing/invite-friend.tsx`, and the `invite` / `onInvite` props
      it needed
  - `features/notes/note-list.tsx` keeps only `NoteRowText`, the switcher's row. Move it next to
    the switcher if nothing else is left in the file.
- [x] **5.6** Delete code nothing else uses any more. Check each with grep first:
  - `components/ui/sidebar.tsx`, `sheet.tsx`, `skeleton.tsx`, `tooltip.tsx`
  - `hooks/use-mobile.ts`
  - the `sidebar-*` CSS variables in `styles/index.css`
  - Mark `docs/plans/sidebar-*.md` as superseded.
- [x] **5.7** Editor layout without the sidebar: center the writing column with `max-w-3xl` at
      every width, keep the tighter desktop padding, and reword the empty state (W6).

Check:

- Web, phone PWA and desktop each show the same top bar.
- New note, Search and Actions work from the bar and from the keys.
- Dark/Light mode and Sign Out work from the panel, including the unsynced confirm.
- The switcher has no ⋮ button, and Ctrl/⌘+K from the switcher opens the panel.

Done as (2026-11-28):

- **Panel rows.**
  - Dark Mode / Light Mode and Sign Out are group 4.
  - Sign Out shows "Syncing…" as a notice. While it runs, the row is disabled.
  - The unsynced confirm moved to `app.tsx`.
- **Switcher.** It has no ⋮ menu. `NoteRowText` moved into `note-switcher.tsx`, and
  `note-list.tsx` is deleted.
- **Top bar.**
  - `features/notes/top-bar.tsx` holds Actions, New note, Search and the title (`inset-x-32`
    again: three buttons).
  - Its top padding is `env(safe-area-inset-top)`.
  - It always carries `data-tauri-drag-region`, which does nothing outside the desktop app.
  - `desktop/title-bar.tsx` is now the shared bar plus Minimize / Close.
- **Layout.**
  - `app.tsx` scrolls one `h-dvh` box, with the bar sticky at the top. Safe-area padding is on the
    left, right and bottom.
  - The editor toolbar sticks below the bar (`top-[calc(env(safe-area-inset-top)+3rem)]`); before,
    it slid under the desktop title bar.
  - The empty state waits for the list to load, and now reads "Create one with + at the top".
- **Deleted.**
  - `notes-sidebar.tsx`, `sidebar-toggle.tsx`, `auth/account-footer.tsx`, `note-list.tsx` and
    `InviteButton`.
  - The shadcn `sidebar`, `sheet`, `skeleton` and `tooltip`, plus `hooks/use-mobile.ts` and the
    `--sidebar*` CSS variables.
  - `sidebar-*.md` are marked superseded.
- **Not deleted.** `components/ui/scroll-area.tsx` was already unused before this phase. It is
  left alone.
- **Checks.**
  - `pnpm check` and `pnpm build` pass. The precache is 30 entries, 1297 KiB.
  - Not yet checked on a real phone or in the desktop app.
- `pnpm build && pnpm preview`: offline start still works (the service worker precache shrank,
  never grew past 2 MiB).

## Editor chrome (owner feedback, 2026-11-28)

Phases 6–13 each handle one point of the owner's list. Each phase can be committed on its own.
The order follows the dependencies. 6 sets the toolbar's size, and 7–9 move it around. 10 changes
the scroll box that 7 and 9 sit in.

**Layout modes**, decided by the owner. Every phase below uses these words:

| Mode        | When                                                            | Top bar centre | Editor toolbar             | Toasts        |
| ----------- | --------------------------------------------------------------- | -------------- | -------------------------- | ------------- |
| **desktop** | the Tauri app (`isDesktop()`), any width                        | note title     | bottom of the window       | top centre    |
| **phone**   | width under 640px (Tailwind `sm`), browser tab or installed PWA | note title     | bottom, above the keyboard | top centre    |
| **web**     | browser tab or installed PWA, 640px or wider                    | the toolbar    | in the top bar (no title)  | bottom centre |

An installed PWA at 640px or wider counts as **web** for the toolbar. Its toasts still go at the
top centre, because point 6 says "desktop window or PWA". A plain browser tab at 640px or wider
puts toasts at the bottom.

One hook supplies this: `hooks/use-layout.ts`.

- It returns `"desktop" | "phone" | "web"`, plus `isApp` (desktop app or standalone PWA, using
  the same check as `isIosBrowser` in `lib/platform.ts`).
- It reads `matchMedia("(min-width: 640px)")` through `useSyncExternalStore`, so it follows window
  resizes.

### Phase 6: Smaller toolbar (point 5)

Goal: the toolbar matches Raycast Notes in size. Picture: one slim row of 16px icons in small
square buttons, with chevrons on the dropdowns, thin dividers between groups, and a round ✕ at
the right end (the ✕ comes in phase 8).

- [x] **6.1** `editor/toolbar.tsx`, desktop and web:
  - buttons are 28px (`h-7 min-w-7`) with 16px icons
  - group gaps are `gap-0.5`, with a 1px divider and `px-1`
  - the bar's padding is `p-0.5` and its radius `rounded-[10px]`
  - the dropdown chevron is 12px
- [x] **6.2** Phone: buttons go from 40px down to 36px (`h-9 min-w-9`), with 18px icons. That is
      still a fair touch size; Apple asks for 44pt, and 36px is the smallest this plan accepts.
      The bar stays on one line down to a 360px-wide phone.
- [x] **6.3** Check the dropdowns (Headings, text style, lists) still open from the smaller
      buttons. Their menu items keep the current size.

Done as (2026-11-28): only `editor/toolbar.tsx` changed. The bar's `[&_button]` / `[&_svg]` rules size every control in it: Toggles, menu triggers and the link button. Desktop and web get 28px buttons with `px-1.5` and 16px icons (24px was tried and dropped, owner 2026-11-28). Phone sizes use a new `phone:` variant (`styles/index.css`: below 640px and not inside `.desktop`), because the desktop window is usually under 640px wide and was picking up the 36px phone sizes. Hover is `bg-foreground/10`, pressed and open menus `bg-foreground/15`; the theme's muted barely showed on the bar in dark mode. Also `gap-0.5`, `p-0.5`, `rounded-[10px]`, and dividers with `ml-0.5 pl-1`. Phones get 36px buttons with 18px icons. The chevron was already 12px. The toolbar dropdowns (owner, 2026-11-28, Raycast screenshot) use a lighter background in dark mode (`color-mix` of popover and 10% foreground), and their rows highlight with `bg-foreground/10` on hover and `/15` when checked. Not yet compared with Raycast on screen.
Check: compare it with the Raycast screenshot at the same window width, in both themes.

### Phase 7: Toolbar in the top bar on web (point 1)

Goal: **web** shows the formatting toolbar in the centre of the top bar, where the title was.
**desktop** and **phone** keep the title there.

- [x] **7.1** `features/notes/top-bar.tsx` renders a centre slot `<div id="top-bar-centre">`. In
      **web** it holds nothing else. In the other modes the title is shown, as today.
- [x] **7.2** The editor owns the toolbar, because it needs the editor instance. In **web**,
      `editor/editor.tsx` renders `<Toolbar>` through `createPortal` into the centre slot.
      Elsewhere it stays where it is. Fall back to the inline toolbar if the slot is missing, for
      example on the share-link page.
- [x] **7.3** In the bar, the toolbar is centred and fits between the left buttons and the edge.
  - Keeps its border and background there (owner, 2026-11-28; first built frameless).
  - Below about 720px it may scroll sideways (`overflow-x-auto`, no scrollbar) rather than wrap.
- [x] **7.4** **desktop**: the toolbar always sits at the bottom of the window, as in Raycast,
      not sticky under the bar. This drops the `sm:` sticky-top rule from 5.7 for desktop.
- [x] **7.5** Viewers (read-only notes) and no-access notes: show nothing in the slot, the same as
      today's disabled state, or keep the title there.

Done as (2026-11-28):

- `hooks/use-layout.ts` returns `desktop` / `phone` / `web` (`isApp` waits for phase 11).
- `TopBar` renders `<div id="top-bar-centre">` in web and the title elsewhere.
- `Editor` finds the slot after commit and portals `<Toolbar inBar>` into it. In the bar it keeps
  its border and background (owner, 2026-11-28; first built frameless), stays on one line, and
  scrolls sideways if narrow.
- Desktop: `desktop:fixed … bottom-2`, plus `.desktop .ProseMirror` bottom padding.
- 7.5: viewers see the disabled toolbar in the bar, as they saw it inline before.
- Not yet checked in a browser.

Check: in a browser tab, resize across 640px. The toolbar moves between the bottom and the top
bar, and the title comes and goes, without losing the editor's selection.

### Phase 8: Hide the toolbar (point 4)

Goal: on **phone** and **desktop**, a ✕ hides the toolbar. In its place a slim bar shows the
note's character count and a **T** button that brings the toolbar back, as in the Raycast
screenshots.

- [x] **8.1** `hooks/use-toolbar-hidden.ts`:
  - It stores `jot-toolbar-hidden` in `localStorage`, because it is remembered on this device
    (owner, 2026-11-28).
  - It uses `useSyncExternalStore`, so every editor and tab on the device agree. The `storage`
    event keeps other tabs in step.
  - Wrap reads and writes in try/catch, as `use-theme.ts` does.
- [x] **8.2** The toolbar's last item is a round ✕ button (`Cancel01Icon` in a filled circle),
      labelled "Hide toolbar". It appears in **phone** and **desktop** only, not in **web**,
      where the toolbar lives in the top bar.
- [x] **8.3** Hidden state: `editor/toolbar-collapsed.tsx` (new) is the same height and place
      as the toolbar.
  - In the centre, muted: "N characters", with the same count rule as the note list (line breaks
    left out, `getTitleAndPreview` in `features/notes/note-meta.ts`). It is read live from the
    editor's text and updates as you type.
  - On the right, a **T** button (`TextFontIcon` or similar) labelled "Show toolbar".
- [x] **8.4** Action Panel row: **Show Toolbar / Hide Toolbar** in group 2, in **phone** and
      **desktop** only. It has no key yet; Raycast uses none either.

Done as (2026-11-28):

- `hooks/use-toolbar-hidden.ts` as planned (`jot-toolbar-hidden`, `storage` event, try/catch).
- No `toolbar-collapsed.tsx`: `Toolbar` itself swaps its buttons for the count and the T button
  when hidden, so the bar keeps its frame and place with no second copy of its classes. The count
  is `getTitleAndPreview(editor.getText()).chars`, computed only while hidden.
- The ✕ (its own divided group, last) and the hidden state apply whenever the toolbar is not in
  the top bar, so phone and desktop. Web ignores the setting.
- Panel row `toolbar` (group 2, `TextFontIcon`), hidden in web.
- Not yet checked in a browser.

Check: hide the toolbar, reload, and open another note. It stays hidden, and the count matches
the switcher's "N characters" for that note.

### Phase 9: Toolbar above the phone keyboard (point 7)

Goal: on **phone**, while typing, the toolbar (or the collapsed bar from 8) sits just above the
on-screen keyboard. A button closes the keyboard.

- [ ] **9.1** Android: `index.html` already has `interactive-widget=resizes-content`, so the page
      shrinks above the keyboard and `bottom-*` already works there. Confirm it on a real phone.
- [x] **9.2** ~~iOS ignores that setting.~~ Dropped: iOS keeps fixed bars above the keyboard too (see Done as).
  - `hooks/use-keyboard-inset.ts` reads `window.visualViewport`:
    `inset = innerHeight - visualViewport.height - visualViewport.offsetTop`. It listens to
    `resize` and `scroll`.
  - It writes the inset to `--keyboard-inset` on `<html>`.
  - The phone toolbar's bottom becomes
    `calc(max(0.5rem, env(safe-area-inset-bottom)) + var(--keyboard-inset, 0px))`.
  - The safe-area padding counts only when the keyboard is closed. With the keyboard up, the
    home-bar inset is under the keyboard.
- [x] **9.3** A **Close keyboard** button (`KeyboardIcon` with a down arrow, or `ArrowDown01Icon`)
      at the toolbar's right end, before the ✕. It appears only in **phone**, while the editor
      has focus. It calls `editor.commands.blur()`, which closes the keyboard on iOS and Android.
      The collapsed bar from 8 shows it too.
- [x] **9.4** The editor's bottom padding grows with the inset, so the caret line never sits
      under the toolbar. Scroll the caret into view on `visualViewport` resize.
- [ ] **9.5** The toast position (phase 11) uses the same inset when it is at the bottom.

Done as (2026-11-28):

- 9.2 dropped (owner's iPhone test, 2026-11-28): iOS already keeps a bottom-fixed bar above the
  keyboard, like Android. The first build added the keyboard height again
  (`hooks/use-keyboard-inset.ts`, `--keyboard-inset`), which pushed the toolbar up to the top bar
  on a new note. The hook is deleted; the bar keeps `bottom-[max(0.5rem,env(safe-area-inset-bottom))]`
  and the note's phone padding stays `5rem`.
- Close keyboard: `KeyboardOffIcon`, phone only, shown while the editor has focus, in the
  toolbar's last group before the ✕ and at the end of the collapsed bar. `pointerdown` is
  prevented so the tap does not blur the note before `click` runs `editor.commands.blur()`.
- First iPhone test (owner, 2026-11-28): the iOS "Install Jot" hint sat at the bottom over the
  toolbar (z-30 over z-10), above the keyboard too, in the page's own colour. It moved to the top
  under the bar, on a new `--raised` token (`bg-raised`: popover, plus 10% text colour in dark
  mode), which the toolbar menus now use as well.
- Two taps to open the keyboard (owner's iPhone test, 2026-11-28): New note and picking from the
  switcher focus the editor from an effect (`focusKey`). iOS then focuses it without the
  keyboard, so the first tap only moved the caret. Touch screens (`pointer: coarse`) now skip
  that focus; one tap focuses the note and opens the keyboard.
- Dialog lists did not scroll on iPhone (owner, 2026-11-28; Chrome never, Safari sometimes).
  Bisected with a temporary switch: only taking the transform off the dialog box fixed it.
  `components/ui/dialog.tsx` and `alert-dialog.tsx` now centre with `inset-0 m-auto h-fit`
  instead of `-translate-x/y-1/2`; the panel and switcher use `top-[15%] bottom-auto`. That alone
  did not fix it; the open animation is also off on touch screens (`pointer-coarse:animate-none!`).
- 9.1 (Android) and 9.5 (toast, waits for phase 11) are still open; nothing was tried on a real
  phone.

Check on a real iPhone (PWA and Safari tab) and an Android phone:

- the toolbar rides on the keyboard while typing
- closing the keyboard drops it back to the bottom
- nothing jumps when the keyboard opens

### Phase 10: Scrollbar only on the content, only while scrolling (point 3)

Goal: the top bar (and the bottom toolbar) stay outside the scroll area. The scrollbar spans only
the note, and it shows only while scrolling, like Raycast Notes.

- [ ] **10.1** In `app.tsx`, the page becomes a flex column of `h-dvh`. The top bar is a plain
      child, no longer sticky. A `flex-1 min-h-0 overflow-y-auto` box holds the editor, and only
      that box scrolls. Fixed toolbars (desktop, phone) are outside it, and the box gets bottom
      padding for them.
- [ ] **10.2** `hooks/use-scroll-fade.ts` puts `data-scrolling` on the box during scroll and
      removes it 800ms after the last scroll event.
- [ ] **10.3** CSS in `styles/index.css`, class `.scroll-fade`:
  - Thin scrollbar (`scrollbar-width: thin`).
  - The thumb is `transparent` normally, and `color-mix(var(--muted-foreground) 40%, transparent)`
    while `[data-scrolling]` or `:hover` on the bar.
  - Use `scrollbar-color` (Chromium 121+, Firefox). WebView2 and current Chrome support it, so no
    `::-webkit-scrollbar` rules are needed.
  - iOS already has overlay scrollbars.
- [ ] **10.4** Use the same `.scroll-fade` on the switcher, panel and Recently Deleted lists.
- [ ] **10.5** Remove the 5.7 sticky toolbar offset; nothing sticks inside the scroll box any more.

Check (desktop): no scrollbar beside the top bar. Scrolling shows a thin thumb on the note area
only, and it fades out after a moment.

### Phase 11: Toast placement and "Note deleted" (point 6)

Goal: deleting a note shows a toast. In **desktop**, **phone** and an installed PWA it sits at
the top centre; in a **web** browser tab, at the bottom centre. Owner: message only, no Undo.

- [ ] **11.1** `editor/notice.tsx`:
  - `NoticeToast` takes its position from `useLayout()`. Top: just under the top bar
    (`top-[calc(env(safe-area-inset-top)+3rem)]`). Bottom: as today.
  - Every toast follows this rule, including the editor's own ("Select text to add a link", the
    image refusals), so there is one rule.
- [ ] **11.2** Messages:
  - Delete Note (own): "Note deleted".
  - Leave note: "Left note".
  - Delete All: "N notes deleted".
  - Removing a note you lost access to shows no toast; it is not your action.
  - Set them in `deleteNote` / `handleRemoveLost` / `handleDeleteAll` in `app.tsx`, only after the
    delete succeeded. Server failures keep their own messages.
- [ ] **11.3** The top toast sits above dialogs' blur (z-index) and never covers the top bar's
      buttons. It stays centred in a 380px desktop window.

Check: delete from the panel and with Ctrl+D in each mode. The toast shows in the right place,
once, and goes after 4s.

### Phase 12: New phone notes start with a Heading 2 (point 2)

Goal: a note created in **phone** mode starts with its first line as Heading 2. The user can
change it with the toolbar; otherwise it stays H2. Notes created on web or desktop are unchanged,
and existing notes are never rewritten (owner, 2026-11-28).

- [ ] **12.1** `app.tsx` marks a draft as "phone" when `handleNew` runs in **phone** mode, and
      passes `startWithHeading` to `<Editor>` for that draft only.
- [ ] **12.2** `editor/editor.tsx`: once the editor is ready and the draft's doc is still blank,
      run `setNode("heading", { level: 2 })` on the first line. Enter at the end of it gives a
      normal paragraph next, which is Tiptap's default.
- [ ] **12.3** Blank checks: covered by `blank-notes.md` E1 (owner, 2026-11-28: blank = no text and
      no image, whatever the blocks), so an empty H2 already counts as blank. Do E1 first.
- [ ] **12.4** The title is still the first line's text, so the list, switcher and top bar are
      unaffected.

Check on a phone:

- New note: the caret is in an H2 line.
- Leave it empty and go back: no empty note is left behind.
- Type a title and press Enter: the next line is normal text.
- Change the first line to a paragraph: it stays one.

### Phase 13: shadcn-style checkboxes (point 8)

Goal: checklist boxes look like the shadcn Checkbox, not the browser's native box.

- [ ] **13.1** CSS only, in `styles/index.css` (the TaskItem input stays a real
      `<input type="checkbox">`, so clicks, keyboard and screen readers keep working):
  - `appearance: none`
  - a 16px box with `border: 1px solid var(--input)` and a 4px radius, on `var(--background)`
  - when checked, `background: var(--primary)`, the border the same colour, and a check mark in
    `var(--primary-foreground)` from a CSS mask (inline SVG data URI), like shadcn's
    `CheckIcon`
  - `:focus-visible` gets the shadcn ring (`var(--ring)` at 50%)
- [ ] **13.2** Dark mode uses the same tokens, so nothing extra is needed. Check both themes.
- [ ] **13.3** Viewers: the existing rule keeps `pointer-events: none`. Add `opacity: 0.7`.
- [ ] **13.4** No shadcn `Checkbox` component: it is a React component, and the box lives inside a
      Tiptap node view. A React node view per item would cost far more than this CSS for the same
      look.

Check: tick and untick with the mouse, a tap, and Space on a focused box. Ticked items stay muted
and struck through.

### Phase 14: Docs

- [ ] **14.1** `project-context.md`:
  - In §12, mark "Command palette" as Decided, with the keys and the date.
  - In the §12 desktop app row, change the switcher key to Ctrl+P.
  - In §12, record that the sidebar was removed (2026-11-28) and the top bar is shared.
- [ ] **14.2** `project-context.md` §10: add ticked items for the Action Panel, Recently Deleted,
      Delete All, the shared top bar and the editor chrome (phases 6–13).
- [ ] **14.3** `desktop-app.md` 3.5: switcher keys are now Ctrl/⌘+P, and Ctrl/⌘+K opens the Action
      Panel.
- [ ] **14.4** Set this plan's status to done.

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
