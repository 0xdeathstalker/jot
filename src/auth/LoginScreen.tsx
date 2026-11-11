import { authClient } from "@/auth/client"
import { Button } from "@/components/ui/button"
import { type InviteLink, setJoinCookie } from "@/features/sharing/inviteLink"

// Better Auth sends the browser back to the app with ?error=<code> when a sign-in is refused,
// e.g. the Google account is not on ALLOWED_EMAILS and has no valid join link.
function getSignInError(invite: InviteLink | null): string | null {
  if (!new URLSearchParams(window.location.search).get("error")) return null
  if (invite?.kind === "join") {
    return "This invite link has expired, was turned off, or has no places left. Ask for a new one."
  }
  if (invite?.kind === "share") {
    return "That Google account has no Jot account. Ask for a Jot join link first, then open this link again."
  }
  return "That Google account is not allowed to use Jot."
}

const COPY = {
  join: { lead: "You've been invited to Jot.", button: "Continue with Google" },
  share: { lead: "Sign in to open the shared note.", button: "Continue with Google" },
  none: { lead: "Sign in to open your notes.", button: "Continue with Google" },
}

export function LoginScreen({ invite = null }: { invite?: InviteLink | null }) {
  const error = getSignInError(invite)
  const copy = COPY[invite?.kind ?? "none"]

  const signIn = () => {
    // A join link lets a brand-new person sign up: leave its token for the Worker to read.
    if (invite?.kind === "join") setJoinCookie(invite.token)
    // Come back to the same link page afterwards, so the link is used (or reported) there.
    const callbackURL = invite ? window.location.pathname : "/"
    void authClient.signIn.social({ provider: "google", callbackURL })
  }

  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-semibold">Jot</h1>
      <p className="text-muted-foreground">{copy.lead}</p>
      {error && (
        <p role="alert" className="max-w-sm text-sm text-destructive">
          {error}
        </p>
      )}
      <Button onClick={signIn}>{copy.button}</Button>
    </main>
  )
}
