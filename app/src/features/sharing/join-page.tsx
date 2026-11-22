import * as React from "react"

import { Button } from "@/components/ui/button"
import { acceptJoinLink } from "@/features/sharing/api"
import { clearJoinCookie } from "@/features/sharing/invite-link"

const MESSAGES: Record<string, string> = {
  invalid: "This invite link is not valid.",
  gone: "This invite link no longer works.",
  full: "This invite link has no places left.",
  offline: "Connect to the internet to join Jot.",
}

// Signed-in person on /join/<token>. Normally the sign-up already used the link (the Worker's
// sign-up hook), so this just confirms and goes home.
export function JoinPage({ token }: { token: string }) {
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    void acceptJoinLink(token).then((result) => {
      if (cancelled) return
      clearJoinCookie()
      if (result.ok) window.location.replace("/")
      else setError(MESSAGES[result.error] ?? "Could not join. Try again later.")
    })
    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-semibold">Jot</h1>
      {error ? (
        <>
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button onClick={() => window.location.replace("/")}>Go to my notes</Button>
        </>
      ) : (
        <p className="text-muted-foreground">Joining…</p>
      )}
    </main>
  )
}
