import MiniSearch from "minisearch"
import * as React from "react"

import type { Note } from "@/sync/index-doc"

// Local search over title + preview. The list is small, so the index is rebuilt whenever it
// changes instead of being updated incrementally, but only while searching: the editor rewrites
// the list every 500 ms while typing.
export function useNoteSearch(notes: Note[], query: string): Note[] {
  const q = query.trim()
  const searching = q !== ""
  const index = React.useMemo(() => {
    if (!searching) return null
    const search = new MiniSearch<Note>({ fields: ["title", "preview"] })
    search.addAll(notes)
    return search
  }, [notes, searching])

  return React.useMemo(() => {
    if (!index) return notes // pinned first, then newest
    const byId = new Map(notes.map((note) => [note.id, note]))
    return index
      .search(q, { boost: { title: 2 }, prefix: true, fuzzy: 0.2 })
      .flatMap((hit) => byId.get(hit.id) ?? []) // ranked best match first
  }, [index, notes, q])
}
