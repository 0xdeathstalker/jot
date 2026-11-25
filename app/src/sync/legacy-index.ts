// Phase 3 kept the note list in a shared placeholder doc (IndexedDB `jot-index-default`).
// Phase 4 gives every user their own index, so the first user to sign in on a device takes the old
// list with them. It is a CRDT merge, so running it twice is harmless; the old database is kept
// as a backup and never deleted.
import { IndexeddbPersistence } from "y-indexeddb"
import { type Doc, Doc as YDoc, applyUpdate, encodeStateAsUpdate } from "yjs"

const LEGACY_DB = "jot-index-default"
const CLAIMED_FLAG = "jot-legacy-index-claimed"

export async function carryOverLegacyIndex(target: Doc): Promise<void> {
  try {
    if (localStorage.getItem(CLAIMED_FLAG)) return
  } catch {
    return // storage blocked: skip rather than merge on every load
  }

  const legacy = new YDoc()
  const persistence = new IndexeddbPersistence(LEGACY_DB, legacy)
  await persistence.whenSynced
  if (legacy.getMap("notes").size > 0) applyUpdate(target, encodeStateAsUpdate(legacy))
  await persistence.destroy()

  try {
    localStorage.setItem(CLAIMED_FLAG, "1")
  } catch {
    // ignored: the merge is idempotent
  }
}
