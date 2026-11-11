import type { Doc } from "yjs"

import { sharedWithMe } from "@/features/sharing/api"
import { setNoteRole } from "@/sync/indexDoc"

// Our role on a shared note can be changed by its owner while we are away or reading it. The
// server is the truth: copy what it says into our list so the editor matches (read-only or not).
export async function refreshRoles(doc: Doc) {
  const result = await sharedWithMe()
  if (!result.ok) return // offline: keep what we have
  for (const { noteId, role } of result.data.notes) setNoteRole(doc, noteId, role)
}
