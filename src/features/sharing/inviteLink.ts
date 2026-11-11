// Link pages: /join/<token> (become a Jot user) and /share/<token> (open one note).
export type InviteLink = { kind: "join" | "share"; token: string }

// Tokens are 32 random bytes as base64url (43 characters).
const PATH = /^\/(join|share)\/([\w-]{20,100})\/?$/

export function readInviteLink(): InviteLink | null {
  const match = PATH.exec(window.location.pathname)
  return match ? { kind: match[1] as InviteLink["kind"], token: match[2] } : null
}

// A new person's sign-up is allowed by the join link's token. The login screen leaves it in this
// cookie for the Google round trip; the Worker reads it (worker/auth/auth.ts, JOIN_COOKIE).
const COOKIE = "jot-invite"

export function setJoinCookie(token: string) {
  const secure = window.location.protocol === "https:" ? "; Secure" : ""
  document.cookie = `${COOKIE}=${token}; Max-Age=900; Path=/; SameSite=Lax${secure}`
}

export function clearJoinCookie() {
  document.cookie = `${COOKIE}=; Max-Age=0; Path=/`
}
