import type { Lobby } from "partyserver"

import { isEmailAllowed } from "./allowlist.ts"
import { createAuth } from "./auth.ts"

// The Worker checks every room connection (docs/project-context.md section 8): never trust the client.
const ROOM_NAME = /^[\w-]{1,100}$/

type User = { id: string; email: string }

// Returns the signed-in user, or null. Also null when the email left ALLOWED_EMAILS: the sign-up
// hook only covers new accounts, so removing someone has to take effect here.
async function getUser(request: Request, env: Env): Promise<User | null> {
  const origin = new URL(request.url).origin
  const session = await createAuth(env, origin).api.getSession({ headers: request.headers })
  const user = session?.user
  if (!user || !isEmailAllowed(user.email, env.ALLOWED_EMAILS)) return null
  return { id: user.id, email: user.email }
}

// First logged-in user to open a note becomes its owner. Safe against two simultaneous first
// connections: the unique index `note_one_owner` lets only one INSERT win. Note ids are random
// UUIDs, so this works for notes created offline. Reads first so repeat visits cost no write.
export async function canOpenNote(db: D1Database, noteId: string, userId: string) {
  const isMember = () =>
    db
      .prepare("SELECT 1 AS ok FROM note_members WHERE note_id = ? AND user_id = ?")
      .bind(noteId, userId)

  const [existing] = await db.batch([isMember()])
  if (existing.results.length > 0) return true

  const [, claimed] = await db.batch([
    db
      .prepare(
        "INSERT OR IGNORE INTO note_members (note_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)",
      )
      .bind(noteId, userId, Date.now()),
    isMember(),
  ])
  return claimed.results.length > 0
}

// Used for both WebSocket upgrades (onBeforeConnect) and plain requests (onBeforeRequest).
// Returns a Response to refuse, or undefined to let the request through to the room.
export async function guardRoom(
  request: Request,
  env: Env,
  lobby: Lobby<Env>,
): Promise<Response | undefined> {
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
    return lobby.name === `index-${user.id}`
      ? undefined
      : new Response("Forbidden", { status: 403 })
  }
  if (lobby.className === "NoteRoom") {
    return (await canOpenNote(env.DB, lobby.name, user.id))
      ? undefined
      : new Response("Forbidden", { status: 403 })
  }
  return new Response("Forbidden", { status: 403 })
}
