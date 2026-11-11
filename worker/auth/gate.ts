import type { Lobby } from "partyserver"

import { createAuth } from "./auth.ts"
import { isActiveUser } from "./invites.ts"

// The Worker checks every room connection (docs/project-context.md section 8): never trust the client.
const ROOM_NAME = /^[\w-]{1,100}$/

export type User = { id: string; email: string }

// The signed-in user (valid session cookie), active or not.
export async function getSignedInUser(request: Request, env: Env): Promise<User | null> {
  const origin = new URL(request.url).origin
  const session = await createAuth(env, origin).api.getSession({ headers: request.headers })
  return session?.user ? { id: session.user.id, email: session.user.email } : null
}

// The signed-in user, or null. Also null when they are not active (not on ALLOWED_EMAILS and not
// invited): the sign-up hook only covers new accounts, so removing someone has to take effect here.
export async function getUser(request: Request, env: Env): Promise<User | null> {
  const user = await getSignedInUser(request, env)
  return user && (await isActiveUser(env, user)) ? user : null
}

export type Role = "owner" | "editor" | "viewer"

// First logged-in user to open a note becomes its owner. Safe against two simultaneous first
// connections: the unique index `note_one_owner` lets only one INSERT win. Note ids are random
// UUIDs, so this works for notes created offline. Reads first so repeat visits cost no write.
// Returns the caller's role on the note, or null when they may not open it.
export async function canOpenNote(
  db: D1Database,
  noteId: string,
  userId: string,
): Promise<Role | null> {
  const roleOf = () =>
    db
      .prepare("SELECT role FROM note_members WHERE note_id = ? AND user_id = ?")
      .bind(noteId, userId)

  const [existing] = await db.batch<{ role: Role }>([roleOf()])
  if (existing.results[0]) return existing.results[0].role

  const [, claimed] = await db.batch<{ role: Role }>([
    db
      .prepare(
        "INSERT OR IGNORE INTO note_members (note_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)",
      )
      .bind(noteId, userId, Date.now()),
    roleOf(),
  ])
  return claimed.results[0]?.role ?? null
}

// Used for both WebSocket upgrades (onBeforeConnect) and plain requests (onBeforeRequest).
// Returns a Response to refuse, or a Request (the same one plus trusted headers) to pass on.
export async function guardRoom(
  request: Request,
  env: Env,
  lobby: Lobby<Env>,
): Promise<Response | Request> {
  // Cross-site WebSocket hijacking: a browser always sends Origin on a WebSocket handshake.
  const origin = request.headers.get("Origin")
  if (origin && origin !== new URL(request.url).origin) {
    return new Response("Forbidden", { status: 403 })
  }

  if (!ROOM_NAME.test(lobby.name)) return new Response("Bad room name", { status: 400 })

  const user = await getUser(request, env)
  if (!user) return new Response("Unauthorized", { status: 401 })

  if (lobby.className === "IndexRoom") {
    // Everyone gets exactly one index room: their own.
    return lobby.name === `index-${user.id}` ? request : new Response("Forbidden", { status: 403 })
  }
  if (lobby.className === "NoteRoom") {
    const role = await canOpenNote(env.DB, lobby.name, user.id)
    if (!role) return new Response("Forbidden", { status: 403 })
    // The room trusts these two headers, so they are always set here and overwrite anything the
    // client sent. A client-supplied role would otherwise be a way to become an editor.
    const headers = new Headers(request.headers)
    headers.set("x-jot-role", role)
    headers.set("x-jot-user", user.id)
    return new Request(request, { headers })
  }
  return new Response("Forbidden", { status: 403 })
}
