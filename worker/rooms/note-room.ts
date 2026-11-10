import { YServer } from "y-partyserver"
import { applyUpdate, encodeStateAsUpdate } from "yjs"

const KEY = "doc"

// State lives in the DO's own storage (KV API, backed by its SQLite): one compacted Yjs update.
// Known limit: y-partyserver's save timer keeps the DO awake while typing (partykit #427).
export class NoteRoom extends YServer {
  static options = { hibernate: true }
  static callbackOptions = { debounceWait: 1000, debounceMaxWait: 10000 }

  // Only apply onto the existing doc; never replace it (an empty doc would erase the note on save).
  async onLoad() {
    const saved = this.ctx.storage.kv.get<Uint8Array>(KEY)
    if (saved) applyUpdate(this.document, saved)
  }

  async onSave() {
    this.ctx.storage.kv.put(KEY, encodeStateAsUpdate(this.document))
  }
}
