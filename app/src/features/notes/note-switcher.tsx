import { PinIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { cn } from "cn"
import * as React from "react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useNoteSearch } from "@/hooks/use-note-search"
import { focusInOtherDialog } from "@/lib/focus"
import { timeAgo } from "@/lib/time-ago"
import type { Note } from "@/sync/index-doc"

// Notes saved before `chars` existed: estimate from title + preview until their next edit.
function characters(note: Note) {
  const n = note.chars ?? note.title.length + note.preview.length
  return `${n} character${n === 1 ? "" : "s"}`
}

// A note's two lines: title (pin, badge) and details (current or last edit, characters).
function NoteRowText({ note, current }: { note: Note; current: boolean }) {
  return (
    <>
      <span
        className={cn(
          "flex items-center gap-1.5 truncate text-sm font-medium",
          !note.title && "text-muted-foreground",
        )}
      >
        {note.pinned && <HugeiconsIcon icon={PinIcon} className="size-3! shrink-0" />}
        <span className="truncate">{note.title || "Untitled"}</span>
        {(note.shared || note.role || note.noAccess) && (
          <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-normal text-muted-foreground">
            {note.noAccess ? "No access" : note.role === "viewer" ? "View only" : "Shared"}
          </span>
        )}
      </span>
      <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
        {current ? (
          <>
            <span className="size-1.5 shrink-0 rounded-full bg-primary" />
            Current
          </>
        ) : (
          `Edited ${timeAgo(note.updatedAt)}`
        )}
        {` • ${characters(note)}`}
      </span>
    </>
  )
}

// Ctrl/⌘+P: the note list. Jump to a note by typing (app.tsx opens it); arrows move, Enter opens.
// Pin, share and delete act on the open note, from the Action Panel (no per-row menu, owner
// 2026-11-28). A combobox: focus stays in the input, the list follows aria-activedescendant.
export function NoteSwitcher({
  notes,
  activeId,
  open,
  onOpenChange,
  onPick,
}: {
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

  // Start empty on each open, however it was closed: app.tsx closes it too, when Ctrl/⌘+K swaps
  // it for the Action Panel.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    setQuery("")
    setActive(0)
  }

  // Focus on close. After a pick the new note's editor focuses itself once mounted (app.tsx): the
  // switcher must not move it (the editor it would find is about to be replaced). Same when another
  // dialog opened in its place and already has focus (Ctrl/⌘+K). Closed with Esc or a click
  // outside: back to the open note's editor.
  const skipFocus = React.useRef(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const finalFocus = () => {
    const skip = skipFocus.current
    skipFocus.current = false
    if (skip || focusInOtherDialog(inputRef.current)) return false
    return document.querySelector<HTMLElement>(".ProseMirror") ?? false
  }

  const pick = (note: Note | undefined) => {
    if (!note) return
    skipFocus.current = true
    onOpenChange(false)
    onPick(note.id)
  }

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") setActive((i) => Math.min(i + 1, results.length - 1))
    else if (event.key === "ArrowUp") setActive((i) => Math.max(i - 1, 0))
    else if (event.key === "Enter") pick(results[active])
    else return
    event.preventDefault()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Blur, no darkening (owner, 2026-11-22; every dialog, components/ui). Desktop: every
          dialog is 340px wide so it fits the smallest window (380×320, tauri/src/lib.rs; set in
          components/ui/dialog.tsx). This one is 48px down with a 40px input + 212px list. The
          Action Panel uses the same sizes. */}
      <DialogContent
        showCloseButton={false}
        className="top-[15%] translate-y-0 gap-0 p-0 desktop:top-12 desktop:gap-0 desktop:p-0"
        finalFocus={finalFocus}
      >
        <DialogTitle className="sr-only">Go to note</DialogTitle>
        {/* The dialog focuses this on open (first focusable element). */}
        <input
          ref={inputRef}
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
          className="h-12 w-full border-b bg-transparent px-4 text-sm outline-none desktop:h-10"
        />
        {/* ARIA combobox: a native <select> cannot filter as you type. Keys are handled on the
            input above, so the options need no key handlers of their own. */}
        <div
          id={listId}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
          role="listbox"
          aria-label="Notes"
          className="max-h-56 overflow-y-auto p-1 desktop:max-h-[212px]"
        >
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
                aria-current={note.id === activeId ? "page" : undefined}
                tabIndex={-1}
                onMouseMove={() => setActive(i)}
                onClick={() => pick(note)}
                className={cn(
                  "flex min-w-0 cursor-default flex-col gap-0.5 rounded-3xl px-3 py-2",
                  i === active && "bg-accent",
                )}
              >
                <NoteRowText note={note} current={note.id === activeId} />
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
