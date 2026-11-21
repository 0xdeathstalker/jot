import { cn } from "cn"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { NoteActions, type NoteActionHandlers, NoteRowText } from "@/features/notes/note-list"
import { useNoteSearch } from "@/hooks/use-note-search"
import type { Note } from "@/sync/index-doc"

// Ctrl+P / ⌘K: jump to a note by typing (app.tsx opens it). Same search, rows and ⋮ menu as the
// sidebar; arrows move, Enter opens. A combobox: focus stays in the input, the list follows
// aria-activedescendant.
export function NoteSwitcher({
  notes,
  activeId,
  open,
  onOpenChange,
  onPick,
  onTogglePin,
  onShare,
  onDelete,
}: NoteActionHandlers & {
  notes: Note[]
  activeId: string | null
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

  // Focus on close. After a pick the new note's editor focuses itself once mounted (app.tsx), and
  // after Share / Delete their dialog takes focus: the switcher must not move it (the editor it
  // would find is about to be replaced, and focus then fell to the title bar). Closed with Esc or
  // a click outside: back to the open note's editor, never to the sidebar toggle.
  const skipFocus = React.useRef(false)
  const finalFocus = () => {
    const skip = skipFocus.current
    skipFocus.current = false
    return skip ? false : (document.querySelector<HTMLElement>(".ProseMirror") ?? false)
  }

  // Close first, then act (no dialog stacked on the switcher).
  const closeThen = (action: () => void) => {
    skipFocus.current = true
    handleOpenChange(false)
    action()
  }

  const pick = (note: Note | undefined) => {
    if (note) closeThen(() => onPick(note.id))
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
      {/* Blur, no darkening (owner, 2026-11-22). */}
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-transparent supports-backdrop-filter:backdrop-blur-sm"
        className="top-[15%] translate-y-0 gap-0 p-0"
        finalFocus={finalFocus}
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
              // The ⋮ button sits beside the option, not in it: an option holds no controls, and a
              // click on ⋮ must not open the note. Mouse only (tabIndex -1): the keyboard stays in
              // the search box; the sidebar has the same menu for keyboard use.
              <div
                key={note.id}
                role="presentation"
                onMouseMove={() => setActive(i)}
                className={cn("flex items-center rounded-3xl", i === active && "bg-accent")}
              >
                {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events */}
                <div
                  id={optionId(i)}
                  // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
                  role="option"
                  aria-selected={i === active}
                  aria-current={note.id === activeId ? "page" : undefined}
                  tabIndex={-1}
                  onClick={() => pick(note)}
                  className="flex min-w-0 flex-1 cursor-default flex-col gap-0.5 px-3 py-2"
                >
                  <NoteRowText note={note} current={note.id === activeId} />
                </div>
                <NoteActions
                  note={note}
                  onTogglePin={onTogglePin}
                  onShare={(id) => closeThen(() => onShare(id))}
                  onDelete={(id) => closeThen(() => onDelete(id))}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      tabIndex={-1}
                      aria-label={`Actions for ${note.title || "Untitled"}`}
                      className="mr-1.5 shrink-0"
                    />
                  }
                />
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
