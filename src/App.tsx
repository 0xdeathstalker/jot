import { Editor } from "@/editor/Editor"

// Phase 1: no router. The room is `?note=<id>`; anything unsafe for a URL path falls back to "test".
function getNoteId(): string {
  const id = new URLSearchParams(window.location.search).get("note")
  return id && /^[\w-]{1,64}$/.test(id) ? id : "test"
}

function App() {
  const noteId = getNoteId()

  return (
    <main className="mx-auto max-w-3xl p-4">
      <Editor key={noteId} noteId={noteId} />
    </main>
  )
}

export default App
