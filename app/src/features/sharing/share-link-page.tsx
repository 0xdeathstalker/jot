import * as React from "react"
import type { Doc } from "yjs"

import { Button } from "@/components/ui/button"
import { acceptShareLink } from "@/features/sharing/api"
import { addSharedNote } from "@/sync/index-doc"

const MESSAGES: Record<string, string> = {
  invalid: "This link is not valid.",
  gone: "This link has expired or was turned off. Ask the owner for a new one.",
  full: "This note already has the maximum number of people.",
  unauthorized: "Your account cannot open shared notes yet. Ask for a Jot join link first.",
  offline: "Connect to the internet to open this link.",
}

// Signed-in person on /share/<token>: take the place on the note, add it to their list, open it.
export function ShareLinkPage({
  token,
  doc,
  onOpen,
}: {
  token: string
  doc: Doc
  onOpen: (noteId: string) => void
}) {
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void acceptShareLink(token).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setError(MESSAGES[result.error] ?? "Could not open this link. Try again later.")
        return
      }
      const { noteId, role } = result.data
      // The owner opening their own link already has the note in their list.
      if (role !== "owner") addSharedNote(doc, noteId, role)
      onOpen(noteId) // replaces /share/<token> in the address bar: the token leaves the history
    })
    return () => {
      cancelled = true
    }
  }, [token, doc, onOpen])

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-4 text-center">
      {error ? (
        <>
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button onClick={() => window.location.replace("/")}>Go to my notes</Button>
        </>
      ) : (
        <p className="text-muted-foreground">Opening shared note…</p>
      )}
    </div>
  )
}
