// The ONLY module that imports y-partyserver (docs/project-context.md §13 rule 5).
import { useEffect, useState } from "react"
import { IndexeddbPersistence } from "y-indexeddb"
import YProvider from "y-partyserver/provider"
import { Doc } from "yjs"

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

    return () => {
      document.removeEventListener("visibilitychange", reconnect)
      window.removeEventListener("online", reconnect)
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

// The note list. `index-default` is a Phase 3 placeholder: Phase 4 migrates it to
// `index-<userId>` by copying the doc, never by renaming in place.
export function useIndexSession(): RoomSession {
  return useRoomSession({
    party: "index-room",
    room: "index-default",
    idbName: "jot-index-default",
  })
}
