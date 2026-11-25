// The share/join REST API's shapes, shared by the Worker (worker/share.ts, worker/join.ts) and the
// client (app/src/features/sharing/api.ts). Types only: import with `import type`, never runtime code
// (it would have to run in both the browser and workerd). docs/plans/repo-layout.md

export type Role = "owner" | "editor" | "viewer"
// The roles a share link gives (a note has one owner, never made by a link).
export type LinkRole = "editor" | "viewer"

export type Member = { userId: string; role: Role; name: string; email: string }
export type ShareLink = { role: LinkRole; url: string }
// GET /api/share/:noteId
export type ShareInfo = { members: Member[]; links: ShareLink[]; limit: number }
// POST /api/share/accept
export type AcceptedShare = { noteId: string; role: Role }
// GET /api/share/mine
export type SharedNotes = { notes: { noteId: string; role: LinkRole }[] }
// Ids of the notes I own (rebuilds a list the server lost).
export type OwnedNotes = { notes: string[] }
// GET /api/join
export type JoinInfo = { url: string; used: number; limit: number }
