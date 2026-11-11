// Everything Jot keeps on this device lives in IndexedDB databases named `jot-*`
// (jot-note-<id>, jot-index-<userId>). Sign-out removes them so the next person using this
// browser finds nothing (docs/plans/phase-4-auth.md, B6).
const PREFIX = "jot-"
const WIPE_FLAG = "jot-wipe-pending"

// `indexedDB.databases()` exists in current Chrome, Firefox and Safari; without it we cannot list.
export async function listLocalDatabases(): Promise<string[]> {
  try {
    const all = (await indexedDB.databases?.()) ?? []
    return all.flatMap((db) => (db.name?.startsWith(PREFIX) ? [db.name] : []))
  } catch {
    return []
  }
}

// The databases are deleted on the NEXT page load, before anything opens them: while the app is
// running, its own connections would block the delete.
export function requestWipe() {
  try {
    localStorage.setItem(WIPE_FLAG, "1")
  } catch {
    // Storage blocked: nothing was cached in localStorage either.
  }
}

export async function wipeIfPending() {
  try {
    if (!localStorage.getItem(WIPE_FLAG)) return
  } catch {
    return
  }
  const names = await listLocalDatabases()
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

// Asks the browser not to evict our IndexedDB when it is short on space. Only a request: Safari
// and Chrome decide for themselves (installed apps and frequent use help), and the server copy is
// the safety net either way.
export function requestDurableStorage() {
  void navigator.storage?.persist?.().catch(() => {})
}
