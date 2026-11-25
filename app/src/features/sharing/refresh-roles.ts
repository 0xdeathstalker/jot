import type { Doc } from "yjs"

import { sharedWithMe } from "@/features/sharing/api"
import { reconcileShared } from "@/sync/index-doc"

// The owner can change our role on a shared note, or remove us, while we are away or reading it.
// The server is the truth: copy what it says into our list so the editor matches (read-only or
// not) and removed notes are marked "No access".
export async function refreshRoles(doc: Doc) {
  const result = await sharedWithMe()
  if (!result.ok) return // offline: keep what we have
  reconcileShared(doc, result.data.notes)
}
