import { YServer } from "y-partyserver"

// ponytail: in-memory only until Phase 2 adds onLoad/onSave (DO SQLite).
// Known limit: y-partyserver's save timer keeps the DO awake while typing (partykit #427).
export class NoteRoom extends YServer {
  static options = { hibernate: true }
}
