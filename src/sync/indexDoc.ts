// The per-user note list: one Y.Map "notes" in the index Y.Doc, one nested Y.Map per note.
// Nested maps (not plain objects) so concurrent edits to different fields both survive.
// Never remove a key: soft delete only, or an offline device resurrects the note.
import { useMemo, useSyncExternalStore } from "react"
import { type Doc, Map as YMap } from "yjs"

export type NoteMeta = {
  title: string // first line of the note
  preview: string // first ~200 chars after the title
  createdAt: number
  updatedAt: number
  pinned: boolean
  deleted: boolean
  // Sharing (Phase 6). UI hints only: the server decides access from D1.
  role?: SharedRole // set when someone else owns the note; absent means you own it
  shared?: boolean // you own it and have made a share link
}
export type SharedRole = "editor" | "viewer"
export type Note = NoteMeta & { id: string }

type NotesMap = YMap<YMap<unknown>>

const getNotes = (doc: Doc): NotesMap => doc.getMap("notes") as NotesMap

export function createNote(doc: Doc): string {
  const id = crypto.randomUUID()
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

// The owner made a share link for this note.
export function markShared(doc: Doc, id: string) {
  const note = getNotes(doc).get(id)
  if (note && !note.get("shared")) note.set("shared", true)
}

// Ignores ids missing from the index (e.g. a note opened by URL): the list is the source of truth.
// Writes only what changed, so an unchanged edit costs no sync traffic.
export function updateMeta(doc: Doc, id: string, next: Pick<NoteMeta, "title" | "preview">) {
  const note = getNotes(doc).get(id)
  if (!note) return
  if (note.get("title") === next.title && note.get("preview") === next.preview) return
  doc.transact(() => {
    note.set("title", next.title)
    note.set("preview", next.preview)
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
      createdAt: (note.get("createdAt") as number) ?? 0,
      updatedAt: (note.get("updatedAt") as number) ?? 0,
      pinned: !!note.get("pinned"),
      deleted: false,
      role: (note.get("role") as SharedRole | undefined) ?? undefined,
      shared: !!note.get("shared") || undefined,
    })
  })
  return list.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt)
}

// useSyncExternalStore needs a stable snapshot: rebuild the array only when the Y.Map changes,
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
  const store = useMemo(() => createStore(doc), [doc])
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}
