import { useEffect } from "react"

import { authClient } from "@/auth/client"

export type AuthUser = { id: string; name: string; email: string; image?: string | null }
export type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: AuthUser }

// The last signed-in user is cached so the app still opens offline and reopens instantly.
// It only names local storage: the server never trusts it (every socket is checked there).
const CACHE_KEY = "jot-auth-user"

function readCached(): AuthUser | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const user = raw ? (JSON.parse(raw) as AuthUser) : null
    return user?.id ? user : null
  } catch {
    return null
  }
}

function writeCached(user: AuthUser | null) {
  try {
    if (user) localStorage.setItem(CACHE_KEY, JSON.stringify(user))
    else localStorage.removeItem(CACHE_KEY)
  } catch {
    // Storage blocked (private mode): the app just works online-only.
  }
}

export function useAuthUser(): AuthState {
  const { data, isPending, error } = authClient.useSession()
  const sessionUser = data?.user

  useEffect(() => {
    if (isPending) return
    if (sessionUser) {
      const { id, name, email, image } = sessionUser
      writeCached({ id, name, email, image })
    } else if (!error) {
      writeCached(null) // the server says "no session" (not a network failure): forget the user
    }
  }, [sessionUser, isPending, error])

  if (sessionUser) {
    const { id, name, email, image } = sessionUser
    return { status: "signedIn", user: { id, name, email, image } }
  }
  // Still asking the server, or offline (the lookup failed): fall back to the cached user, so a
  // network problem never locks you out of your own offline notes.
  if (isPending || error) {
    const cached = readCached()
    if (cached) return { status: "signedIn", user: cached }
    if (isPending) return { status: "loading" }
  }
  return { status: "signedOut" }
}

export async function signOut() {
  writeCached(null)
  await authClient.signOut()
}
