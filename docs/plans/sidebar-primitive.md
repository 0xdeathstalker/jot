# Plan: Notes sidebar on the shadcn `Sidebar` primitive

> Superseded (2026-11-28): the sidebar was removed. See `action-panel.md`, phase 5.

Status: done (2026-11-16)

Goal: replace the hand-built `<aside>` in `src/app.tsx` with `src/components/ui/sidebar.tsx`, and stop
the sidebar from doing work the user never sees.

## What was slow

- The search `query` lived in `NotesApp`, so every keystroke in the search box re-rendered the
  editor too.
- `useNoteSearch` rebuilt the MiniSearch index on every list change. The editor writes the title
  and character count every 500 ms while typing, so the index was rebuilt constantly with no search.
- On phones the list was always rendered, only hidden with CSS.

## Changes

- `src/features/notes/notes-sidebar.tsx` (new): `Sidebar` with header (New note, search), content
  (`NoteList`) and footer (`AccountFooter`). Owns `query`, so typing in search re-renders only
  the sidebar. Closes the mobile sheet after New note, opening a note and Share.
- `NoteList` rows use `SidebarMenu` / `SidebarMenuItem` / `SidebarMenuButton` / `SidebarMenuAction`;
  placeholders use `Skeleton`. Same two-line height as before.
- `useNoteSearch` builds the index only while a query is typed.
- `src/app.tsx`: `SidebarProvider` + `SidebarInset`; one `SidebarTrigger` above the editor on every
  size replaces the phone-only menu button. Collapsed = fully hidden everywhere (default
  `collapsible="offcanvas"`; an icon rail was tried and rejected by the owner, 2026-11-17).
  Open/closed on desktop is kept in the `sidebar_state` cookie the provider already writes.
- Phones (< 768 px): the sidebar is a `Sheet`, mounted only while open. (Later replaced by a
  Base UI `Drawer` for the edge swipe: `docs/plans/sidebar-edge-swipe.md`.)
- `sidebar.tsx`: its Ctrl/⌘+B toggle ignores key presses the editor already handled, so Bold in
  the editor does not also toggle the sidebar. Its phone sheet slides the full width with no fade
  (linear like desktop, 150 ms vs desktop's 200 ms) instead of the Sheet's fade + 2.5rem nudge. Re-apply both if the
  component is re-added.

## Not done

- Memoised rows: the list is small and `readNotes` makes new objects on every change, so memo would
  need a field-by-field compare. Add it if long lists feel slow.

## Check

- Desktop: collapse with the trigger and with Ctrl+B outside the editor; Ctrl+B inside the editor
  only bolds; reload keeps the collapsed state.
- Phone width: trigger opens the sheet; opening a note, New note and Share close it; Sign out and
  Invites dialogs work from inside it.
- Search, pin, delete/leave confirmation, skeleton rows while loading.
