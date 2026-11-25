import { NoteRoom } from "./note-room.ts"

// The per-user note list. Same persistence and hibernation as a note, but its own Durable Object
// namespace (party `index-room`) so Phase 4/6 can give it different permissions.
export class IndexRoom extends NoteRoom {}
