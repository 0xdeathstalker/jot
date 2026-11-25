import { isEmailAllowed } from "./allowlist.ts"

// "Join Jot" links (docs/plans/phase-6-sharing.md): an original user (email on ALLOWED_EMAILS)
// can bring in JOIN_LIMIT people. The login screen puts the link's token in this cookie just
// before the Google redirect; the sign-up hook in auth.ts reads it.
export const JOIN_COOKIE = "jot-invite"
export const JOIN_LIMIT = 3

type Person = { id: string; email: string }

export type JoinStatus =
  | { status: "ok"; inviter: string }
  | { status: "invalid" } // no such token
  | { status: "gone" } // revoked, expired, or its maker left ALLOWED_EMAILS
  | { status: "full" } // the maker has used all their places

// Looks a join token up. A maker who has since left ALLOWED_EMAILS counts as gone: their links
// die with their access.
export async function joinStatus(env: Env, token: string): Promise<JoinStatus> {
  const row = await env.DB.prepare(
    `SELECT u.id AS id, u.email AS email, i.revoked_at AS revoked_at, i.expires_at AS expires_at
     FROM user_invites i JOIN user u ON u.id = i.created_by WHERE i.token = ?`,
  )
    .bind(token)
    .first<Person & { revoked_at: number | null; expires_at: number }>()
  if (!row) return { status: "invalid" }
  if (row.revoked_at !== null || row.expires_at <= Date.now()) return { status: "gone" }
  if (!isEmailAllowed(row.email, env.ALLOWED_EMAILS)) return { status: "gone" }
  const used = await env.DB.prepare("SELECT count(*) AS n FROM invited_users WHERE invited_by = ?")
    .bind(row.id)
    .first<{ n: number }>()
  return (used?.n ?? 0) < JOIN_LIMIT ? { status: "ok", inviter: row.id } : { status: "full" }
}

// May a new person sign up with this token? (Checked before the account is created.)
export async function canJoin(env: Env, token: string): Promise<boolean> {
  return (await joinStatus(env, token)).status === "ok"
}

// Marks a new account as invited. The limit check and the insert are one statement, so two
// people signing up at the same moment cannot both take the last place.
export async function recordJoin(env: Env, userId: string, token: string): Promise<boolean> {
  const found = await joinStatus(env, token)
  if (found.status !== "ok") return false
  const result = await env.DB.prepare(
    `INSERT INTO invited_users (user_id, invited_by, created_at)
     SELECT ?, ?, ? WHERE (SELECT count(*) FROM invited_users WHERE invited_by = ?) < ?`,
  )
    .bind(userId, found.inviter, Date.now(), found.inviter, JOIN_LIMIT)
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
