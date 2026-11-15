// The per-user note list: one Y.Map "notes" in the index Y.Doc, one nested Y.Map per note.
// Nested maps (not plain objects) so concurrent edits to different fields both survive.
// Never remove a key: soft delete only, or an offline device resurrects the note.
import * as React from "react"
import { type Doc, Map as YMap } from "yjs"

import type { NoteText } from "@/features/notes/note-meta"

export type NoteMeta = {
  title: string // first line of the note
  preview: string // first ~200 chars after the title (search only, not shown)
  chars?: number // characters in the note, line breaks left out; absent until the note's next edit
  createdAt: number
  updatedAt: number
  pinned: boolean
  deleted: boolean
  // Sharing (Phase 6). UI hints only: the server decides access from D1.
  role?: SharedRole // set when someone else owns the note; absent means you own it
  shared?: boolean // you own it and have made a share link
  noAccess?: boolean // someone else owns it and has removed you (learned from the server)
}
export type SharedRole = "editor" | "viewer"
export type Note = NoteMeta & { id: string }

type NotesMap = YMap<YMap<unknown>>

const getNotes = (doc: Doc): NotesMap => doc.getMap("notes") as NotesMap

// `id`: a draft's id, so the note keeps the id it was opened with (docs/plans/blank-notes.md).
// Never overwrites an entry that already exists: that would drop its pin and sharing marks.
export function createNote(doc: Doc, id: string = crypto.randomUUID()): string {
  if (getNotes(doc).has(id)) return id
  const now = Date.now()
  const meta: NoteMeta = {
    title: "",
    preview: "",
    createdAt: now,
    updatedAt: now,
    pinned: false,
    deleted: false,
  }
  const note = new YMap<unknown>(Object.entries(meta))
  getNotes(doc).set(id, note)
  return id
}

// A note someone else owns, added after opening their share link. The title is a placeholder until
// the note is opened and its first line is known. Brings back an entry left or deleted earlier.
export function addSharedNote(doc: Doc, id: string, role: SharedRole) {
  const existing = getNotes(doc).get(id)
  if (existing) {
    doc.transact(() => {
      existing.set("deleted", false)
      existing.set("role", role)
      existing.set("noAccess", false)
    })
    return
  }
  const now = Date.now()
  const meta: NoteMeta = {
    title: "Shared note",
    preview: "",
    createdAt: now,
    updatedAt: now,
    pinned: false,
    deleted: false,
    role,
  }
  getNotes(doc).set(id, new YMap<unknown>(Object.entries(meta)))
}

// Brings our list in line with what the server says we may open (`mine`: the notes shared with us,
// with our current role). Notes we own are never touched. A shared note missing from `mine` is
// marked noAccess; one that is back, or whose role changed, is corrected.
export function reconcileShared(doc: Doc, mine: { noteId: string; role: SharedRole }[]) {
  const roles = new Map(mine.map((entry) => [entry.noteId, entry.role]))
  doc.transact(() => {
    getNotes(doc).forEach((note, id) => {
      if (note.get("deleted") || !note.get("role")) return
      const role = roles.get(id)
      if (!role) {
        if (!note.get("noAccess")) note.set("noAccess", true)
        return
      }
      if (note.get("role") !== role) note.set("role", role)
      if (note.get("noAccess")) note.set("noAccess", false)
    })
  })
}

// The owner made a share link for this note.
export function markShared(doc: Doc, id: string) {
  const note = getNotes(doc).get(id)
  if (note && !note.get("shared")) note.set("shared", true)
}

// Ignores ids missing from the index (e.g. a note opened by URL): the list is the source of truth.
// Writes only what changed, so an unchanged edit costs no sync traffic.
export function updateMeta(doc: Doc, id: string, next: NoteText) {
  const note = getNotes(doc).get(id)
  if (!note) return
  if (
    note.get("title") === next.title &&
    note.get("preview") === next.preview &&
    note.get("chars") === next.chars
  )
    return
  doc.transact(() => {
    note.set("title", next.title)
    note.set("preview", next.preview)
    note.set("chars", next.chars)
    note.set("updatedAt", Date.now())
  })
}

export function togglePin(doc: Doc, id: string) {
  const note = getNotes(doc).get(id)
  if (note) note.set("pinned", !note.get("pinned"))
}

export function softDelete(doc: Doc, id: string) {
  getNotes(doc).get(id)?.set("deleted", true)
}

// Pinned first, then newest. Soft-deleted notes are left out.
function readNotes(notes: NotesMap): Note[] {
  const list: Note[] = []
  notes.forEach((note, id) => {
    if (note.get("deleted")) return
    list.push({
      id,
      title: (note.get("title") as string) ?? "",
      preview: (note.get("preview") as string) ?? "",
      chars: note.get("chars") as number | undefined,
      createdAt: (note.get("createdAt") as number) ?? 0,
      updatedAt: (note.get("updatedAt") as number) ?? 0,
      pinned: !!note.get("pinned"),
      deleted: false,
      role: (note.get("role") as SharedRole | undefined) ?? undefined,
      shared: !!note.get("shared") || undefined,
      noAccess: !!note.get("noAccess") || undefined,
    })
  })
  return list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
}

// React.useSyncExternalStore needs a stable snapshot: rebuild the array only when the Y.Map changes,
// never inside getSnapshot (a new array per call re-renders forever).
function createStore(doc: Doc) {
  const notes = getNotes(doc)
  let snapshot = readNotes(notes)
  return {
    subscribe(onChange: () => void) {
      snapshot = readNotes(notes) // catch changes that landed before subscribing
      const handler = () => {
        snapshot = readNotes(notes)
        onChange()
      }
      notes.observeDeep(handler)
      return () => notes.unobserveDeep(handler)
    },
    getSnapshot: () => snapshot,
  }
}

export function useNotes(doc: Doc): Note[] {
  const store = React.useMemo(() => createStore(doc), [doc])
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot)
}
