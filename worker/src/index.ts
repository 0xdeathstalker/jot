import { routePartykitRequest } from "partyserver"

import { createAuth } from "./auth/auth.ts"
import { guardRoom } from "./auth/gate.ts"
import { handleJoin } from "./join.ts"
import { handleShare } from "./share.ts"

export { IndexRoom } from "./rooms/index-room.ts"
export { NoteRoom } from "./rooms/note-room.ts"

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Static assets (the PWA) are served before this runs, except /api/* (run_worker_first).
    const url = new URL(request.url)
    if (url.pathname.startsWith("/api/auth/")) return createAuth(env, url.origin).handler(request)
    if (url.pathname.startsWith("/api/share/")) return handleShare(request, env)
    if (url.pathname === "/api/join" || url.pathname.startsWith("/api/join/")) {
      return handleJoin(request, env)
    }

    // Party URLs look like /parties/note-room/<noteId> and /parties/index-room/<room>;
    // anything else is unknown.
    const response = await routePartykitRequest(request, env, {
      onBeforeConnect: (req, lobby) => guardRoom(req, env, lobby),
      onBeforeRequest: (req, lobby) => guardRoom(req, env, lobby),
    })
    return response || new Response("Not Found", { status: 404 })
  },
} satisfies ExportedHandler<Env>
