// The ONLY module that imports y-partyserver (docs/project-context.md §13 rule 5).
import * as React from "react"
import { IndexeddbPersistence } from "y-indexeddb"
import YProvider from "y-partyserver/provider"
import { Doc } from "yjs"

import { listedNoteIds } from "@/sync/index-doc"
import { carryOverLegacyIndex } from "@/sync/legacy-index"
import { listLocalDatabases } from "@/sync/local-data"

export type RoomSession = { doc: Doc; provider: YProvider }

// `party` is the kebab-case of the Durable Object binding (NoteRoom -> note-room).
// `room` is the Durable Object identity; `idbName` the local IndexedDB database.
// Renaming either orphans stored data (server copy / users' offline copy): treat them as permanent.
type RoomOptions = { party: string; room: string; idbName: string }

function createSession({ party, room }: RoomOptions): RoomSession {
  const doc = new Doc()
  // Not connected yet: the hook connects. The Y.Doc works locally before the socket opens.
  const provider = new YProvider(window.location.host, room, doc, { party, connect: false })
  return { doc, provider }
}

// One session per mount: key the calling component by room.
// Typing never waits on the network. `loaded`: this device's saved copy is in the doc.
function useRoomSession(options: RoomOptions): { session: RoomSession; loaded: boolean } {
  const [session] = React.useState(() => createSession(options))
  const [loaded, setLoaded] = React.useState(false)
  const { idbName } = options

  React.useEffect(() => {
    const { doc, provider } = session
    // Created here (not in createSession) so Strict Mode's cleanup + remount gets a live one.
    const persistence = new IndexeddbPersistence(idbName, doc)
    let live = true
    void persistence.whenSynced.then(() => live && setLoaded(true))
    void provider.connect()

    // iOS has no background sync: reconnect when the app returns or the network is back.
    const reconnect = () => {
      if (document.visibilityState === "visible" && !provider.wsconnected) void provider.connect()
    }
    document.addEventListener("visibilitychange", reconnect)
    window.addEventListener("online", reconnect)
    // iOS restores pages from the back/forward cache with a dead socket and may not fire
    // visibilitychange.
    window.addEventListener("pageshow", reconnect)

    return () => {
      document.removeEventListener("visibilitychange", reconnect)
      window.removeEventListener("online", reconnect)
      window.removeEventListener("pageshow", reconnect)
      // disconnect(), not destroy(): destroy leaks a reconnect timer (partykit #402),
      // and disconnect lets React Strict Mode remount reconnect the same provider.
      live = false
      provider.disconnect()
      void persistence.destroy()
    }
  }, [session, idbName])

  return { session, loaded }
}

// Calls `onClosed(code)` each time this room's socket closes: the server closes with 4403 when
// someone is removed from a note; a refused reconnect shows up as 1006 (browsers hide the HTTP status).
export function useConnectionClosed(session: RoomSession, onClosed: (code: number) => void) {
  React.useEffect(() => {
    const { provider } = session
    const handler = (event: CloseEvent) => onClosed(event.code)
    provider.on("connection-close", handler)
    return () => provider.off("connection-close", handler)
  }, [session, onClosed])
}

// Stops reconnecting (the provider retries forever by default): used once access is gone.
export function stopSyncing(session: RoomSession) {
  session.provider.disconnect()
}

// One Y.Doc per note: /parties/note-room/<noteId>.
export function useNoteSession(noteId: string): RoomSession {
  return useRoomSession({ party: "note-room", room: noteId, idbName: `jot-note-${noteId}` }).session
}

// One note list per user: /parties/index-room/index-<userId>, IndexedDB jot-index-<userId>.
// These names are permanent. The Phase 3 placeholder `index-default` is carried over once per
// device (legacy-index.ts) and the server no longer allows it (step D).
// `loaded`: the list saved on this device is in (a new device then fills in from the server).
// `synced`: the server's copy has been merged in too (stays true after a later disconnect).
export function useIndexSession(
  userId: string,
): RoomSession & { loaded: boolean; synced: boolean } {
  const { session, loaded } = useRoomSession({
    party: "index-room",
    room: `index-${userId}`,
    idbName: `jot-index-${userId}`,
  })
  const [synced, setSynced] = React.useState(false)

  React.useEffect(() => {
    void carryOverLegacyIndex(session.doc)
  }, [session.doc])

  React.useEffect(() => {
    // The socket opens asynchronously after mount, so its first "sync" always comes after this.
    const { provider } = session
    const handler = (isSynced: boolean) => isSynced && setSynced(true)
    provider.on("sync", handler)
    return () => provider.off("sync", handler)
  }, [session])

  return { ...session, loaded, synced }
}

const SYNC_TIMEOUT_MS = 6000

// Opens a throwaway connection to one room and waits until the server has exchanged state with us,
// then calls `read` on the doc. Null when it could not sync (offline, refused, or timed out).
// "synced" is y-websocket's flag: we received the server's state after our reply to its handshake,
// so edits made while offline have been sent. The short pause lets that reply leave the socket.
async function withSyncedRoom<T>(options: RoomOptions, read: (doc: Doc) => T): Promise<T | null> {
  const { doc, provider } = createSession(options)
  const persistence = new IndexeddbPersistence(options.idbName, doc)
  try {
    await persistence.whenSynced // local edits are in the doc first
    void provider.connect()
    const synced = await new Promise<boolean>((resolve) => {
      if (provider.synced) return resolve(true)
      const timer = setTimeout(() => resolve(false), SYNC_TIMEOUT_MS)
      provider.on("sync", (isSynced: boolean) => {
        if (!isSynced) return
        clearTimeout(timer)
        resolve(true)
      })
    })
    if (!synced) return null
    await new Promise((resolve) => setTimeout(resolve, 300))
    return read(doc)
  } finally {
    provider.disconnect() // not destroy(): partykit #402
    void persistence.destroy()
  }
}

const noteRoom = (noteId: string): RoomOptions => ({
  party: "note-room",
  room: noteId,
  idbName: `jot-note-${noteId}`,
})

// Reads one note without opening it in the editor (also leaves a copy on this device).
export const readNote = <T>(noteId: string, read: (doc: Doc) => T) =>
  withSyncedRoom(noteRoom(noteId), read)

// The ids in this user's list, as saved on this device.
async function localListIds(userId: string): Promise<string[]> {
  const doc = new Doc()
  const persistence = new IndexeddbPersistence(`jot-index-${userId}`, doc)
  try {
    await persistence.whenSynced
    return listedNoteIds(doc)
  } finally {
    void persistence.destroy()
  }
}

// Before sign-out: push this user's list and every note in it that is on this device.
// Other databases (another account's notes, left when its session ended without signing out) are
// not ours to sync: the server refuses them, and they stay for that account (docs/plans/note-list-sync.md).
// Returns how many could not be synced (offline, refused, or timed out). They are all started at
// once: fine for tens of notes; add a concurrency limit if someone has hundreds.
export async function syncAllLocalData(userId: string): Promise<{ failed: number }> {
  const local = new Set(await listLocalDatabases())
  const targets: RoomOptions[] = (await localListIds(userId))
    .map(noteRoom)
    .filter((room) => local.has(room.idbName))
  if (local.has(`jot-index-${userId}`)) {
    targets.push({ party: "index-room", room: `index-${userId}`, idbName: `jot-index-${userId}` })
  }
  const results = await Promise.all(targets.map((room) => withSyncedRoom(room, () => true)))
  return { failed: results.filter((ok) => !ok).length }
}
