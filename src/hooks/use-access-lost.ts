import * as React from "react"

import { sharedWithMe } from "@/features/sharing/api"
import { type RoomSession, stopSyncing, useConnectionClosed } from "@/sync/provider"

// For a note someone else owns: true once the owner has removed us. Two signals:
//  - the server closes our socket with 4403 (we were connected when it happened; 4401 means our
//    role changed, which only needs the automatic reconnect), or
//  - the socket keeps failing and the server's list of notes shared with us no longer has this one
//    (we were away, so the refused reconnect is all we see).
// A dropped network is not mistaken for this: nothing is checked while offline.
export function useAccessLost(
  session: RoomSession,
  noteId: string,
  shared: boolean,
  onRoleChanged?: () => void,
) {
  const [lost, setLost] = React.useState(false)
  const checking = React.useRef(false)

  const markLost = React.useCallback(() => {
    stopSyncing(session) // otherwise the provider retries (and is refused) forever
    setLost(true)
  }, [session])

  const onClosed = React.useCallback(
    (code: number) => {
      if (!shared) return
      if (code === 4403) return markLost()
      if (code === 4401) return onRoleChanged?.() // role changed: the provider reconnects by itself
      if (!navigator.onLine || checking.current) return
      checking.current = true
      void sharedWithMe()
        .then((result) => {
          if (result.ok && !result.data.notes.some((note) => note.noteId === noteId)) markLost()
        })
        .finally(() => {
          checking.current = false
        })
    },
    [shared, noteId, markLost, onRoleChanged],
  )

  useConnectionClosed(session, onClosed)
  return lost
}
