import { getUser, type Role } from "./auth/gate.ts"
import { fail, json, newToken, readJson, WEEK_MS, writeAllowed } from "./http.ts"
import { kickUser } from "./rooms/kick.ts"

// At most this many people besides the owner on one note.
export const NOTE_LIMIT = 2

const NOTE_ID = /^[\w-]{1,100}$/
type InviteRole = "editor" | "viewer"
const isInviteRole = (value: unknown): value is InviteRole =>
  value === "editor" || value === "viewer"

async function roleOn(env: Env, noteId: string, userId: string) {
  const row = await env.DB.prepare(
    "SELECT role FROM note_members WHERE note_id = ? AND user_id = ?",
  )
    .bind(noteId, userId)
    .first<{ role: Role }>()
  return row?.role ?? null
}

const othersOn = async (env: Env, noteId: string) =>
  (
    await env.DB.prepare(
      "SELECT count(*) AS n FROM note_members WHERE note_id = ? AND role != 'owner'",
    )
      .bind(noteId)
      .first<{ n: number }>()
  )?.n ?? 0

const revokeLinks = (env: Env, noteId: string, now: number, role?: InviteRole) =>
  env.DB.prepare(
    `UPDATE note_invites SET revoked_at = ? WHERE note_id = ? AND revoked_at IS NULL${role ? " AND role = ?" : ""}`,
  ).bind(...(role ? [now, noteId, role] : [now, noteId]))

// /api/share/...: share links and members of a note. docs/plans/phase-6-sharing.md, C1 to C7.
//   GET    /mine                       notes shared with me
//   POST   /accept                     { token } open a share link
//   GET    /:noteId                    members + live links (owner)
//   DELETE /:noteId                    stop sharing: remove everyone, revoke links (owner)
//   POST   /:noteId/invite             { role } make a link (owner)
//   DELETE /:noteId/invite/:role       turn a link off (owner)
//   PATCH  /:noteId/members/:userId    { role } raise or lower someone (owner)
//   DELETE /:noteId/members/:userId    remove someone (owner), or yourself to leave
export async function handleShare(request: Request, env: Env): Promise<Response> {
  if (!writeAllowed(request)) return fail(403, "bad_origin")
  const user = await getUser(request, env)
  if (!user) return fail(401, "unauthorized")

  const url = new URL(request.url)
  const [, , , a, b, c, d] = url.pathname.replace(/\/$/, "").split("/") // "", api, share, ...
  const method = request.method
  const now = Date.now()

  if (a === "mine" && !b && method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT note_id AS noteId, role FROM note_members WHERE user_id = ? AND role != 'owner'",
    )
      .bind(user.id)
      .all()
    return json({ notes: rows.results })
  }

  if (a === "accept" && !b && method === "POST") {
    const { token } = await readJson(request)
    if (typeof token !== "string") return fail(400, "bad_request")
    const invite = await env.DB.prepare(
      "SELECT note_id, role, revoked_at, expires_at FROM note_invites WHERE token = ?",
    )
      .bind(token)
      .first<{ note_id: string; role: InviteRole; revoked_at: number | null; expires_at: number }>()
    if (!invite) return fail(404, "invalid")
    if (invite.revoked_at !== null || invite.expires_at <= now) return fail(410, "gone")

    const existing = await roleOn(env, invite.note_id, user.id)
    if (existing === "owner" || existing === "editor") {
      return json({ noteId: invite.note_id, role: existing })
    }
    if (existing === "viewer") {
      // A second link can only raise access, never lower it.
      if (invite.role === "editor") {
        await env.DB.prepare(
          "UPDATE note_members SET role = 'editor' WHERE note_id = ? AND user_id = ?",
        )
          .bind(invite.note_id, user.id)
          .run()
        // Their open connections still carry the viewer role: close them, they reconnect as editor.
        await kickUser(env, invite.note_id, user.id, 4401, "role changed")
      }
      return json({ noteId: invite.note_id, role: invite.role })
    }
    // New member. The limit check and the insert are one statement: no two people take the last place.
    const added = await env.DB.prepare(
      `INSERT INTO note_members (note_id, user_id, role, created_at)
       SELECT ?, ?, ?, ? WHERE (SELECT count(*) FROM note_members WHERE note_id = ? AND role != 'owner') < ?
       ON CONFLICT (note_id, user_id) DO NOTHING`,
    )
      .bind(invite.note_id, user.id, invite.role, now, invite.note_id, NOTE_LIMIT)
      .run()
    if (added.meta.changes > 0) return json({ noteId: invite.note_id, role: invite.role })
    // A parallel accept for the same person (double request) may have inserted first.
    const raced = await roleOn(env, invite.note_id, user.id)
    return raced ? json({ noteId: invite.note_id, role: raced }) : fail(409, "full")
  }

  if (!a || !NOTE_ID.test(a) || a === "mine" || a === "accept") return fail(404, "not_found")
  const noteId = a
  const myRole = await roleOn(env, noteId, user.id)

  // Leaving is the one write a non-owner may make.
  if (b === "members" && c === user.id && !d && method === "DELETE") {
    if (myRole === null) return fail(404, "not_found")
    if (myRole === "owner") return fail(400, "owner_cannot_leave")
    await env.DB.prepare("DELETE FROM note_members WHERE note_id = ? AND user_id = ?")
      .bind(noteId, user.id)
      .run()
    await kickUser(env, noteId, user.id)
    return json({ ok: true })
  }

  if (myRole === null) return fail(404, "not_found")
  if (myRole !== "owner") return fail(403, "forbidden")

  if (!b && method === "GET") {
    const members = await env.DB.prepare(
      `SELECT m.user_id AS userId, m.role AS role, u.name AS name, u.email AS email
       FROM note_members m JOIN user u ON u.id = m.user_id WHERE m.note_id = ? ORDER BY m.created_at`,
    )
      .bind(noteId)
      .all()
    const links = await env.DB.prepare(
      "SELECT role, token, expires_at AS expiresAt FROM note_invites WHERE note_id = ? AND revoked_at IS NULL AND expires_at > ?",
    )
      .bind(noteId, now)
      .all<{ role: string; token: string; expiresAt: number }>()
    return json({
      members: members.results,
      links: links.results.map((l) => ({
        role: l.role,
        url: `${url.origin}/share/${l.token}`,
        expiresAt: l.expiresAt,
      })),
      limit: NOTE_LIMIT,
    })
  }

  if (!b && method === "DELETE") {
    const others = await env.DB.prepare(
      "SELECT user_id AS userId FROM note_members WHERE note_id = ? AND role != 'owner'",
    )
      .bind(noteId)
      .all<{ userId: string }>()
    await env.DB.batch([
      env.DB.prepare("DELETE FROM note_members WHERE note_id = ? AND role != 'owner'").bind(noteId),
      revokeLinks(env, noteId, now),
    ])
    for (const { userId } of others.results) await kickUser(env, noteId, userId)
    return json({ ok: true })
  }

  if (b === "invite" && !c && method === "POST") {
    const { role } = await readJson(request)
    if (!isInviteRole(role)) return fail(400, "bad_role")
    if ((await othersOn(env, noteId)) >= NOTE_LIMIT) return fail(409, "full")
    const token = newToken()
    await env.DB.batch([
      revokeLinks(env, noteId, now, role),
      env.DB.prepare(
        "INSERT INTO note_invites (token, note_id, role, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(token, noteId, role, user.id, now, now + WEEK_MS),
    ])
    return json({ role, url: `${url.origin}/share/${token}`, expiresAt: now + WEEK_MS })
  }

  if (b === "invite" && isInviteRole(c) && !d && method === "DELETE") {
    await revokeLinks(env, noteId, now, c).run()
    return json({ ok: true })
  }

  if (b === "members" && c && !d && method === "PATCH") {
    const { role } = await readJson(request)
    if (!isInviteRole(role)) return fail(400, "bad_role")
    const current = await roleOn(env, noteId, c)
    if (current === null) return fail(404, "not_found")
    if (current === "owner") return fail(400, "owner_cannot_change")
    if (current !== role) {
      await env.DB.prepare("UPDATE note_members SET role = ? WHERE note_id = ? AND user_id = ?")
        .bind(role, noteId, c)
        .run()
      // Their open connections still carry the old role: close them, they reconnect with the new one.
      await kickUser(env, noteId, c, 4401, "role changed")
    }
    return json({ role })
  }

  if (b === "members" && c && !d && method === "DELETE") {
    // The owner removes someone else. Removing yourself as owner was refused above.
    if ((await roleOn(env, noteId, c)) === "owner") return fail(400, "owner_cannot_leave")
    await env.DB.prepare("DELETE FROM note_members WHERE note_id = ? AND user_id = ?")
      .bind(noteId, c)
      .run()
    await kickUser(env, noteId, c)
    return json({ ok: true })
  }

  return fail(404, "not_found")
}
