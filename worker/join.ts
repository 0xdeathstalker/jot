import { isEmailAllowed } from "./auth/allowlist.ts"
import { getSignedInUser } from "./auth/gate.ts"
import { isActiveUser, JOIN_LIMIT, joinStatus, recordJoin } from "./auth/invites.ts"
import { fail, json, newToken, readJson, WEEK_MS, writeAllowed } from "./http.ts"

// /api/join: "Join Jot" links. Original users (ALLOWED_EMAILS) make and manage theirs; anyone
// signed in can accept one. See docs/plans/phase-6-sharing.md, C8.
export async function handleJoin(request: Request, env: Env): Promise<Response> {
  if (!writeAllowed(request)) return fail(403, "bad_origin")
  const user = await getSignedInUser(request, env)
  if (!user) return fail(401, "unauthorized")
  const path = new URL(request.url).pathname.replace(/\/$/, "")

  if (path === "/api/join/accept" && request.method === "POST") {
    const { token } = await readJson(request)
    if (typeof token !== "string") return fail(400, "bad_request")
    if (await isActiveUser(env, user)) return json({ ok: true })
    const found = await joinStatus(env, token)
    if (found.status === "invalid") return fail(404, "invalid")
    if (found.status === "gone") return fail(410, "gone")
    if (found.status === "full") return fail(409, "full")
    return (await recordJoin(env, user.id, token)) ? json({ ok: true }) : fail(409, "full")
  }

  if (path !== "/api/join") return fail(404, "not_found")
  // Only original users make links: invited users cannot bring in more people.
  if (!isEmailAllowed(user.email, env.ALLOWED_EMAILS)) return fail(403, "forbidden")

  const revokeMine = (now: number) =>
    env.DB.prepare(
      "UPDATE user_invites SET revoked_at = ? WHERE created_by = ? AND revoked_at IS NULL",
    ).bind(now, user.id)

  const view = async () => {
    const link = await env.DB.prepare(
      "SELECT token, expires_at FROM user_invites WHERE created_by = ? AND revoked_at IS NULL AND expires_at > ?",
    )
      .bind(user.id, Date.now())
      .first<{ token: string; expires_at: number }>()
    const used = await env.DB.prepare(
      "SELECT count(*) AS n FROM invited_users WHERE invited_by = ?",
    )
      .bind(user.id)
      .first<{ n: number }>()
    return json({
      link: link && {
        url: `${new URL(request.url).origin}/join/${link.token}`,
        expiresAt: link.expires_at,
      },
      used: used?.n ?? 0,
      limit: JOIN_LIMIT,
    })
  }

  if (request.method === "GET") return view()
  if (request.method === "POST") {
    const now = Date.now()
    await env.DB.batch([
      revokeMine(now),
      env.DB.prepare(
        "INSERT INTO user_invites (token, created_by, created_at, expires_at) VALUES (?, ?, ?, ?)",
      ).bind(newToken(), user.id, now, now + WEEK_MS),
    ])
    return view()
  }
  if (request.method === "DELETE") {
    await revokeMine(Date.now()).run()
    return view()
  }
  return fail(405, "method_not_allowed")
}
