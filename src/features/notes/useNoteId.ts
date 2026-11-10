import { useCallback, useSyncExternalStore } from "react"

// The open note lives in the URL: /?note=<id>. No router package: pushState + popstate is enough.
const VALID_ID = /^[\w-]{1,64}$/

function readNoteId(): string | null {
  const id = new URLSearchParams(window.location.search).get("note")
  return id && VALID_ID.test(id) ? id : null
}

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange)
  return () => window.removeEventListener("popstate", onChange)
}

// pushState does not fire popstate, so we dispatch one ourselves to wake the subscribers.
// `replace` swaps the history entry (used for the automatic "open newest note" redirect).
export function useNoteId() {
  const noteId = useSyncExternalStore(subscribe, readNoteId)

  // `null` clears the open note (back to the bare `/`).
  const openNote = useCallback((id: string | null, options?: { replace?: boolean }) => {
    const url = id ? `?note=${encodeURIComponent(id)}` : window.location.pathname
    if (options?.replace) window.history.replaceState(null, "", url)
    else window.history.pushState(null, "", url)
    window.dispatchEvent(new PopStateEvent("popstate"))
  }, [])

  return { noteId, openNote }
}
