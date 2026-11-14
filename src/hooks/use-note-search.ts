import MiniSearch from "minisearch"
import { useMemo } from "react"

import type { Note } from "@/sync/index-doc"

// Local search over title + preview. The list is small, so the index is rebuilt whenever it
// changes instead of being updated incrementally.
export function useNoteSearch(notes: Note[], query: string): Note[] {
  const index = useMemo(() => {
    const search = new MiniSearch<Note>({ fields: ["title", "preview"] })
    search.addAll(notes)
    return search
  }, [notes])

  return useMemo(() => {
    const q = query.trim()
    if (!q) return notes // pinned first, then newest
    const byId = new Map(notes.map((note) => [note.id, note]))
    return index
      .search(q, { boost: { title: 2 }, prefix: true, fuzzy: 0.2 })
      .flatMap((hit) => byId.get(hit.id) ?? []) // ranked best match first
  }, [index, notes, query])
}
