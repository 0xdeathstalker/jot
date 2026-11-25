import type { JoinInfo } from "@shared/api.ts"

import { isEmailAllowed } from "./auth/allowlist.ts"
import { getSignedInUser } from "./auth/gate.ts"
import { isActiveUser, JOIN_LIMIT, joinStatus, recordJoin } from "./auth/invites.ts"
import { fail, json, NEVER, newToken, readJson, writeAllowed } from "./http.ts"

// /api/join: "Join Jot" links. Original users (ALLOWED_EMAILS) get one permanent link; anyone
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

  if (request.method !== "GET") return fail(405, "method_not_allowed")

  // One permanent link per original user, made on first view. The UPDATE makes an older 7-day
  // link permanent (same URL, even if it had expired); the INSERT is skipped when a live link
  // exists (unique index user_invite_live). Every join checks the 3-place limit, so a link that
  // spreads further can never admit more than 3 people.
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE user_invites SET expires_at = ? WHERE created_by = ? AND revoked_at IS NULL",
    ).bind(NEVER, user.id),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user_invites (token, created_by, created_at, expires_at) VALUES (?, ?, ?, ?)",
    ).bind(newToken(), user.id, Date.now(), NEVER),
  ])
  const link = await env.DB.prepare(
    "SELECT token FROM user_invites WHERE created_by = ? AND revoked_at IS NULL",
  )
    .bind(user.id)
    .first<{ token: string }>()
  const used = await env.DB.prepare("SELECT count(*) AS n FROM invited_users WHERE invited_by = ?")
    .bind(user.id)
    .first<{ n: number }>()
  if (!link) return fail(500, "no_link")
  return json({
    url: `${new URL(request.url).origin}/join/${link.token}`,
    used: used?.n ?? 0,
    limit: JOIN_LIMIT,
  } satisfies JoinInfo)
}
