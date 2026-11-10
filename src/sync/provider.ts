// The ONLY module that imports y-partyserver (docs/project-context.md §13 rule 5).
import { useEffect, useState } from "react"
import { IndexeddbPersistence } from "y-indexeddb"
import YProvider from "y-partyserver/provider"
import { Doc } from "yjs"

export type NoteSession = { doc: Doc; provider: YProvider }

// Room name = Durable Object identity: /parties/note-room/<noteId>.
// `party` is the kebab-case of the NoteRoom binding. Not connected yet: the hook connects.
export function createNoteSession(noteId: string): NoteSession {
  const doc = new Doc()
  const provider = new YProvider(window.location.host, noteId, doc, {
    party: "note-room",
    connect: false,
  })
  return { doc, provider }
}

// One session per note id (key the calling component by id).
// The Y.Doc works locally before the socket connects, so typing never waits on the network.
export function useNoteSession(noteId: string): NoteSession {
  const [session] = useState(() => createNoteSession(noteId))

  useEffect(() => {
    const { doc, provider } = session
    // Local copy: survives reloads and offline. Created here (not in createNoteSession) so
    // Strict Mode's cleanup + remount gets a live one. The name is fixed: renaming orphans data.
    const persistence = new IndexeddbPersistence(`jot-note-${noteId}`, doc)
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
  }, [session, noteId])

  return session
}
