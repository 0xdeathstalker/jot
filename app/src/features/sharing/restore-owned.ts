import type { Doc } from "yjs"

import { docText, getTitleAndPreview, isBlankDocument } from "@/features/notes/note-meta"
import { ownedNotes } from "@/features/sharing/api"
import { hasNote, restoreNote } from "@/sync/index-doc"
import { readNote } from "@/sync/provider"

// From 2026-11-11 until the fix, the server dropped every change to the note list, so a list can
// be missing notes its user owns (docs/plans/note-list-sync.md). Adds them back, titled from each
// note's content. Call only once the list has synced with the server: an entry added earlier could
// replace the server's (and bring back a deleted note).
export async function restoreOwned(doc: Doc) {
  const result = await ownedNotes()
  if (!result.ok) return // offline: try again next time
  // One at a time: a list missing many notes should not open many sockets at once.
  for (const id of result.data.notes) {
    if (hasNote(doc, id)) continue
    const read = await readNote(id, (note) =>
      isBlankDocument(note) ? "blank" : getTitleAndPreview(docText(note)),
    )
    // Blank notes (made before drafts existed) stay out. Unreadable ones go in untitled.
    if (read !== "blank") restoreNote(doc, id, read)
  }
}
