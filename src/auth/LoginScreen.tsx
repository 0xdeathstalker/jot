import { authClient } from "@/auth/client"
import { Button } from "@/components/ui/button"

// Better Auth sends the browser back to the app with ?error=<code> when a sign-in is refused,
// e.g. the Google account is not on ALLOWED_EMAILS.
function getSignInError(): string | null {
  const code = new URLSearchParams(window.location.search).get("error")
  return code ? "That Google account is not allowed to use Jot." : null
}

export function LoginScreen() {
  const error = getSignInError()

  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-2xl font-semibold">Jot</h1>
      <p className="text-muted-foreground">Sign in to open your notes.</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        onClick={() => void authClient.signIn.social({ provider: "google", callbackURL: "/" })}
      >
        Continue with Google
      </Button>
    </main>
  )
}
