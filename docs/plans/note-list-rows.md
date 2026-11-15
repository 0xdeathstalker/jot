# Plan: Note list rows keep one height

Status: done in code
Source: owner request, 2026-11-15 (branch `feat/ui-improvements`).

Goal: no blank sidebar while the list loads, and every row is two lines tall.

## How it works

1. **Skeleton rows.** `useIndexSession` returns `loaded` (IndexedDB `whenSynced` for the index doc, in `src/sync/provider.ts`). Until then `NoteList` shows 6 pulsing rows with the same paddings and line heights as a real row (title `h-5`, second line `h-4`).
2. **Rows without a body** show a details line instead of the preview: `Edited <relative time> • <n> characters` (`Intl.RelativeTimeFormat`), or a dot + `Current` for the open note.

## Decisions

| Topic           | Choice                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| "Loaded" source | This device's saved copy only. A new device with nothing saved shows an empty list until the server fills it, no wait |
| Relative time   | Computed at render; may lag until the list re-renders. No timer                                                       |
| No new packages | Yes                                                                                                                   |
