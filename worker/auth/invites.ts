import { isEmailAllowed } from "./allowlist.ts"

// "Join Jot" links (docs/plans/phase-6-sharing.md): an original user (email on ALLOWED_EMAILS)
// can bring in JOIN_LIMIT people. The login screen puts the link's token in this cookie just
// before the Google redirect; the sign-up hook in auth.ts reads it.
export const JOIN_COOKIE = "jot-invite"
export const JOIN_LIMIT = 3

type Person = { id: string; email: string }

// The id of whoever made this link, or null when it is unknown, revoked, expired, or its maker
// has since left ALLOWED_EMAILS (their links die with their access).
async function liveInviter(env: Env, token: string): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT u.id AS id, u.email AS email
     FROM user_invites i JOIN user u ON u.id = i.created_by
     WHERE i.token = ? AND i.revoked_at IS NULL AND i.expires_at > ?`,
  )
    .bind(token, Date.now())
    .first<Person>()
  return row && isEmailAllowed(row.email, env.ALLOWED_EMAILS) ? row.id : null
}

// May a new person sign up with this token? (Checked before the account is created.)
export async function canJoin(env: Env, token: string): Promise<boolean> {
  const inviter = await liveInviter(env, token)
  if (!inviter) return false
  const used = await env.DB.prepare("SELECT count(*) AS n FROM invited_users WHERE invited_by = ?")
    .bind(inviter)
    .first<{ n: number }>()
  return (used?.n ?? 0) < JOIN_LIMIT
}

// Marks a new account as invited. The limit check and the insert are one statement, so two
// people signing up at the same moment cannot both take the last place.
export async function recordJoin(env: Env, userId: string, token: string): Promise<boolean> {
  const inviter = await liveInviter(env, token)
  if (!inviter) return false
  const result = await env.DB.prepare(
    `INSERT INTO invited_users (user_id, invited_by, created_at)
     SELECT ?, ?, ? WHERE (SELECT count(*) FROM invited_users WHERE invited_by = ?) < ?`,
  )
    .bind(userId, inviter, Date.now(), inviter, JOIN_LIMIT)
    .run()
  return result.meta.changes > 0
}

// Active = may use Jot at all: an original user, or someone who joined through a link.
// Holding access to a shared note does not make anyone active.
export async function isActiveUser(env: Env, user: Person): Promise<boolean> {
  if (isEmailAllowed(user.email, env.ALLOWED_EMAILS)) return true
  const row = await env.DB.prepare("SELECT 1 AS ok FROM invited_users WHERE user_id = ?")
    .bind(user.id)
    .first()
  return row !== null
}
