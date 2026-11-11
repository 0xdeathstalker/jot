import type { Connection, ConnectionContext } from "partyserver"
import { YServer } from "y-partyserver"
import { applyUpdate, encodeStateAsUpdate } from "yjs"

const KEY = "doc"

// State lives in the DO's own storage (KV API, backed by its SQLite): one compacted Yjs update.
// Known limit: y-partyserver's save timer keeps the DO awake while typing (partykit #427).
export class NoteRoom extends YServer {
  static options = { hibernate: true }
  static callbackOptions = { debounceWait: 1000, debounceMaxWait: 10000 }

  // Who is connected and with which role, from the headers the Worker guard set (worker/auth/gate.ts).
  // Tags are kept by the runtime across hibernation, and connection.state is already used by
  // y-partyserver for awareness ids, so the role and user live in tags.
  getConnectionTags(_connection: Connection, ctx: ConnectionContext) {
    const role = ctx.request.headers.get("x-jot-role")
    const user = ctx.request.headers.get("x-jot-user")
    return role && user ? [`role:${role}`, `user:${user}`] : []
  }

  // Viewers can read but their document updates are dropped (y-partyserver checks this per message).
  override isReadOnly(connection: Connection) {
    return (
      connection.tags.includes("role:viewer") || !connection.tags.some((t) => t.startsWith("role:"))
    )
  }

  // Called by the Worker (via a stub) when someone is removed from the note.
  kick(userId: string) {
    for (const connection of this.getConnections(`user:${userId}`)) {
      connection.close(4403, "removed")
    }
  }

  // Only apply onto the existing doc; never replace it (an empty doc would erase the note on save).
  async onLoad() {
    const saved = this.ctx.storage.kv.get<Uint8Array>(KEY)
    if (saved) applyUpdate(this.document, saved)
  }

  async onSave() {
    this.ctx.storage.kv.put(KEY, encodeStateAsUpdate(this.document))
  }
}
