// The only place the client talks to the share/join REST API (worker/share.ts, worker/join.ts).
// Expected failures come back as data (`ok: false`), so callers never need try/catch. `offline`
// means the request never reached the server.

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string }

async function call<T>(method: string, path: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null
    return response.ok
      ? { ok: true, data: data as T }
      : { ok: false, status: response.status, error: data?.error ?? "error" }
  } catch {
    return { ok: false, status: 0, error: "offline" }
  }
}

export type Role = "owner" | "editor" | "viewer"
export type LinkRole = "editor" | "viewer"
export type Member = { userId: string; role: Role; name: string; email: string }
export type ShareLink = { role: LinkRole; url: string }
export type ShareInfo = { members: Member[]; links: ShareLink[]; limit: number }
export type JoinInfo = { url: string; used: number; limit: number }

const note = (noteId: string) => `/api/share/${encodeURIComponent(noteId)}`

// Share a note (owner only). Also makes the note's permanent view and edit links on first call.
export const getShareInfo = (noteId: string) => call<ShareInfo>("GET", note(noteId))
export const unshareNote = (noteId: string) => call<{ ok: true }>("DELETE", note(noteId))
// The owner raises or lowers someone's role.
export const changeMemberRole = (noteId: string, userId: string, role: LinkRole) =>
  call<{ role: LinkRole }>("PATCH", `${note(noteId)}/members/${encodeURIComponent(userId)}`, {
    role,
  })
// The owner removes someone, or pass your own id to leave a note.
export const removeMember = (noteId: string, userId: string) =>
  call<{ ok: true }>("DELETE", `${note(noteId)}/members/${encodeURIComponent(userId)}`)

// Open a share link / list what is shared with me.
export const acceptShareLink = (token: string) =>
  call<{ noteId: string; role: Role }>("POST", "/api/share/accept", { token })
export const sharedWithMe = () =>
  call<{ notes: { noteId: string; role: LinkRole }[] }>("GET", "/api/share/mine")

// "Join Jot" link: one permanent link per original user, made on first view (others get 403).
export const getJoinInfo = () => call<JoinInfo>("GET", "/api/join")
export const acceptJoinLink = (token: string) =>
  call<{ ok: true }>("POST", "/api/join/accept", { token })
