// The ONLY module that imports y-partyserver (docs/project-context.md §13 rule 5).
import { useEffect, useState } from "react"
import { IndexeddbPersistence } from "y-indexeddb"
import YProvider from "y-partyserver/provider"
import { Doc } from "yjs"

import { carryOverLegacyIndex } from "@/sync/legacyIndex"
import { listLocalDatabases } from "@/sync/localData"

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
// Typing never waits on the network.
function useRoomSession(options: RoomOptions): RoomSession {
  const [session] = useState(() => createSession(options))
  const { idbName } = options

  useEffect(() => {
    const { doc, provider } = session
    // Created here (not in createSession) so Strict Mode's cleanup + remount gets a live one.
    const persistence = new IndexeddbPersistence(idbName, doc)
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
      provider.disconnect()
      void persistence.destroy()
    }
  }, [session, idbName])

  return session
}

// One Y.Doc per note: /parties/note-room/<noteId>.
export function useNoteSession(noteId: string): RoomSession {
  return useRoomSession({ party: "note-room", room: noteId, idbName: `jot-note-${noteId}` })
}

// One note list per user: /parties/index-room/index-<userId>, IndexedDB jot-index-<userId>.
// These names are permanent. The Phase 3 placeholder `index-default` is carried over once per
// device (legacyIndex.ts) and the server no longer allows it (step D).
export function useIndexSession(userId: string): RoomSession {
  const session = useRoomSession({
    party: "index-room",
    room: `index-${userId}`,
    idbName: `jot-index-${userId}`,
  })

  useEffect(() => {
    void carryOverLegacyIndex(session.doc)
  }, [session.doc])

  return session
}

const SYNC_TIMEOUT_MS = 6000

// Opens a throwaway connection to one room and waits until the server has exchanged state with us.
// "synced" is y-websocket's flag: we received the server's state after our reply to its handshake,
// so edits made while offline have been sent. The short pause lets that reply leave the socket.
async function syncRoom(options: RoomOptions): Promise<boolean> {
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
    if (synced) await new Promise((resolve) => setTimeout(resolve, 300))
    return synced
  } finally {
    provider.disconnect() // not destroy(): partykit #402
    void persistence.destroy()
  }
}

// Before sign-out: push every local note and this user's index to the server.
// Returns how many could not be synced (offline, refused, or timed out). They are all started at
// once: fine for tens of notes; add a concurrency limit if someone has hundreds.
export async function syncAllLocalData(userId: string): Promise<{ failed: number }> {
  const targets: RoomOptions[] = (await listLocalDatabases()).flatMap((name) => {
    if (name === `jot-index-${userId}`)
      return [{ party: "index-room", room: `index-${userId}`, idbName: name }]
    if (name.startsWith("jot-note-")) {
      return [{ party: "note-room", room: name.slice("jot-note-".length), idbName: name }]
    }
    return [] // another account's index or the Phase 3 placeholder: this session cannot sync them
  })
  const results = await Promise.all(targets.map(syncRoom))
  return { failed: results.filter((ok) => !ok).length }
}
