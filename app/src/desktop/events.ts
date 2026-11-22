import { listen } from "@tauri-apps/api/event"

// The tray's "New note" (tauri/src/lib.rs). Resolves to the function that stops listening.
export function onTrayNewNote(handler: () => void) {
  return listen("new-note", handler)
}
