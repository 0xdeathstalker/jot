// Everything Jot keeps on this device lives in IndexedDB databases named `jot-*`
// (jot-note-<id>, jot-index-<userId>). Sign-out removes the signed-out account's own databases, so
// the next person using this browser finds none of its notes (docs/plans/phase-4-auth.md, B6).
// Another account's databases stay: they may hold that account's unsynced offline edits
// (docs/plans/note-list-sync.md, task 6).
import { IndexeddbPersistence } from "y-indexeddb"
import { Doc } from "yjs"

import { allNoteIds } from "@/sync/index-doc"

const PREFIX = "jot-"
const WIPE_FLAG = "jot-wipe-pending"
// The flag's value before task 6: wipe every `jot-*` database. Still honoured, for a wipe an older
// version of the app left pending.
const WIPE_ALL = "1"

// `indexedDB.databases()` exists in current Chrome, Firefox and Safari; without it we cannot list.
export async function listLocalDatabases(): Promise<string[]> {
  try {
    const all = (await indexedDB.databases?.()) ?? []
    return all.flatMap((db) => (db.name?.startsWith(PREFIX) ? [db.name] : []))
  } catch {
    return []
  }
}

// Reads this user's note list as saved on this device (a throwaway copy, closed afterwards).
export async function readLocalList<T>(userId: string, read: (doc: Doc) => T): Promise<T> {
  const doc = new Doc()
  const persistence = new IndexeddbPersistence(`${PREFIX}index-${userId}`, doc)
  try {
    await persistence.whenSynced
    return read(doc)
  } finally {
    void persistence.destroy()
  }
}

// This account's databases: its list, every note the list holds (owned or shared, deleted or not),
// and the Phase 3 placeholder list.
const databasesOf = async (userId: string) => [
  `${PREFIX}index-${userId}`,
  `${PREFIX}index-default`,
  ...(await readLocalList(userId, allNoteIds)).map((id) => `${PREFIX}note-${id}`),
]

// The databases are deleted on the NEXT page load, before anything opens them: while the app is
// running, its own connections would block the delete. If the list cannot be read, wipe everything:
// better than leaving this account's notes behind.
export async function requestWipe(userId: string) {
  let value = WIPE_ALL
  try {
    value = JSON.stringify(await databasesOf(userId))
  } catch {
    // Keep WIPE_ALL.
  }
  try {
    localStorage.setItem(WIPE_FLAG, value)
  } catch {
    // Storage blocked: nothing was cached in localStorage either.
  }
}

export async function wipeIfPending() {
  let pending: string | null
  try {
    pending = localStorage.getItem(WIPE_FLAG)
  } catch {
    return
  }
  if (!pending) return
  const names = pending === WIPE_ALL ? await listLocalDatabases() : parseNames(pending)
  await Promise.all(
    names.map(
      (name) =>
        new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase(name)
          request.onsuccess = request.onerror = request.onblocked = () => resolve()
        }),
    ),
  )
  try {
    localStorage.removeItem(WIPE_FLAG)
    localStorage.removeItem("jot-legacy-index-claimed")
  } catch {
    // ignored
  }
}

// Only our own `jot-*` names, whatever the stored value holds.
function parseNames(value: string): string[] {
  try {
    const names: unknown = JSON.parse(value)
    return Array.isArray(names)
      ? names.filter((name): name is string => typeof name === "string" && name.startsWith(PREFIX))
      : []
  } catch {
    return []
  }
}

// Removes this device's copy of one note (after losing access, or leaving it). Safe to call while
// the note is still open: the delete waits until its connection closes.
export function deleteLocalNote(noteId: string) {
  try {
    indexedDB.deleteDatabase(`${PREFIX}note-${noteId}`)
  } catch {
    // Nothing to remove.
  }
}

// Asks the browser not to evict our IndexedDB when it is short on space. Only a request: Safari
// and Chrome decide for themselves (installed apps and frequent use help), and the server copy is
// the safety net either way.
export function requestDurableStorage() {
  void navigator.storage?.persist?.().catch(() => {})
}
