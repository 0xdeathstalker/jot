import { routePartykitRequest } from "partyserver"

export { IndexRoom } from "./rooms/index-room.ts"
export { NoteRoom } from "./rooms/note-room.ts"

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Static assets (the PWA) are served before this runs. Party URLs look like
    // /parties/note-room/<noteId> and /parties/index-room/<room>; anything else is unknown.
    return (await routePartykitRequest(request, env)) || new Response("Not Found", { status: 404 })
  },
} satisfies ExportedHandler<Env>
