import { cn } from "cn"
import * as React from "react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useNoteSearch } from "@/hooks/use-note-search"
import type { Note } from "@/sync/index-doc"

// Ctrl+P / ⌘K: jump to a note by typing (app.tsx opens it). Same search as the sidebar; arrows
// move, Enter opens. A combobox: focus stays in the input, the list follows aria-activedescendant.
export function NoteSwitcher({
  notes,
  open,
  onOpenChange,
  onPick,
}: {
  notes: Note[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (id: string) => void
}) {
  const [query, setQuery] = React.useState("")
  const [active, setActive] = React.useState(0)
  const results = useNoteSearch(notes, query)
  const listId = React.useId()
  const optionId = (i: number) => `${listId}-${i}`

  React.useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" })
  })

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery("")
      setActive(0)
    }
    onOpenChange(next)
  }

  const pick = (note: Note | undefined) => {
    if (!note) return
    onPick(note.id)
    handleOpenChange(false)
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") setActive((i) => Math.min(i + 1, results.length - 1))
    else if (event.key === "ArrowUp") setActive((i) => Math.max(i - 1, 0))
    else if (event.key === "Enter") pick(results[active])
    else return
    event.preventDefault()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Blur, no darkening (owner, 2026-11-22). On close, focus goes to the editor (the picked
          note, or the one that was open), not back to whatever was focused before (often the
          sidebar toggle). No editor: leave focus alone. */}
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-transparent supports-backdrop-filter:backdrop-blur-sm"
        className="top-[15%] translate-y-0 gap-0 p-0"
        finalFocus={() => document.querySelector<HTMLElement>(".ProseMirror") ?? false}
      >
        <DialogTitle className="sr-only">Go to note</DialogTitle>
        {/* The dialog focuses this on open (first focusable element). */}
        <input
          role="combobox"
          aria-label="Search notes"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={results.length ? optionId(active) : undefined}
          placeholder="Go to note…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={handleKeyDown}
          className="h-12 w-full border-b bg-transparent px-4 text-sm outline-none"
        />
        {/* ARIA combobox: a native <select> cannot filter as you type. Keys are handled on the
            input above, so the options need no key handlers of their own. */}
        {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role */}
        <div id={listId} role="listbox" aria-label="Notes" className="max-h-80 overflow-y-auto p-1">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No notes found</p>
          ) : (
            results.map((note, i) => (
              // oxlint-disable-next-line jsx-a11y/click-events-have-key-events
              <div
                key={note.id}
                id={optionId(i)}
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
                role="option"
                aria-selected={i === active}
                tabIndex={-1}
                onMouseMove={() => setActive(i)}
                onClick={() => pick(note)}
                className={cn(
                  "flex cursor-default flex-col rounded-lg px-3 py-2 text-sm",
                  i === active && "bg-accent text-accent-foreground",
                )}
              >
                <span className={cn("truncate", !note.title && "text-muted-foreground")}>
                  {note.title || "Untitled"}
                </span>
                {note.preview && (
                  <span className="truncate text-xs text-muted-foreground">{note.preview}</span>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
