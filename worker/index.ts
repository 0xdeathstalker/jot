export { NoteRoom } from "./rooms/note-room.ts"

export default {
  fetch() {
    // Static assets (the PWA) are served before this runs; anything else is unknown.
    return new Response(null, { status: 404 })
  },
} satisfies ExportedHandler<Env>
