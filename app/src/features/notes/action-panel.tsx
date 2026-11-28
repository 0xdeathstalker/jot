import { HugeiconsIcon } from "@hugeicons/react"
import { cn } from "cn"
import * as React from "react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Kbd } from "@/components/ui/kbd"
import { Separator } from "@/components/ui/separator"
import type { Action } from "@/hooks/use-action-shortcuts"
import { focusInOtherDialog } from "@/lib/focus"
import { matchesShortcut, shortcutKeys } from "@/lib/platform"

// Ctrl/⌘+K: every action, searchable, with its keys (Raycast's Action Panel,
// docs/plans/action-panel.md). A combobox like the note switcher: focus stays in the input, the
// list follows aria-activedescendant.
// ponytail: second copy of note-switcher.tsx's combobox; extract a shared one if a third appears.
export function ActionPanel({
  actions,
  open,
  onOpenChange,
}: {
  actions: Action[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [query, setQuery] = React.useState("")
  const needle = query.trim().toLowerCase()
  const rows = actions.filter((a) => !a.hidden && a.label.toLowerCase().includes(needle))
  const enabled = rows.flatMap((a, i) => (a.disabled ? [] : [i]))
  const [active, setActive] = React.useState(-1)
  // A row that went away or got disabled hands the highlight to the first enabled one.
  const current = enabled.includes(active) ? active : (enabled[0] ?? -1)
  const listId = React.useId()
  const optionId = (i: number) => `${listId}-${i}`

  React.useEffect(() => {
    if (open) document.getElementById(optionId(current))?.scrollIntoView({ block: "nearest" })
  })

  // Start empty on each open, however it was closed (Ctrl/⌘+K toggles it from app.tsx).
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    setQuery("")
    setActive(-1)
  }
  const handleOpenChange = onOpenChange

  // Focus on close: back to the open note's editor, unless the action opened a dialog of its own,
  // or another dialog already has focus: the panel must not pull it back.
  const skipFocus = React.useRef(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const finalFocus = () => {
    const skip = skipFocus.current
    skipFocus.current = false
    if (skip || focusInOtherDialog(inputRef.current)) return false
    return document.querySelector<HTMLElement>(".ProseMirror") ?? false
  }

  // Close first, then act (no dialog stacked on the panel).
  const run = (action: Action | undefined) => {
    if (!action || action.disabled) return
    skipFocus.current = !!action.dialog
    handleOpenChange(false)
    action.run()
  }

  // Arrows step over disabled rows.
  const step = (by: 1 | -1) => {
    const at = enabled.indexOf(current)
    const next = enabled[Math.min(Math.max(at + by, 0), enabled.length - 1)]
    if (next !== undefined) setActive(next)
  }

  // An action's own keys work here too, closing the panel first (the app-wide listener then sees
  // defaultPrevented and leaves it).
  const handleKeyDown = (event: React.KeyboardEvent) => {
    const hit = actions.find(
      (a) => a.keys && !a.hidden && matchesShortcut(event.nativeEvent, a.keys),
    )
    if (hit) run(hit)
    else if (event.key === "ArrowDown") step(1)
    else if (event.key === "ArrowUp") step(-1)
    else if (event.key === "Enter") run(rows[current])
    else return
    event.preventDefault()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/* Same look and place as the note switcher. */}
      <DialogContent
        showCloseButton={false}
        className="top-[15%] bottom-auto gap-0 p-0 desktop:top-14 desktop:gap-0 desktop:p-0"
        finalFocus={finalFocus}
      >
        <DialogTitle className="sr-only">Actions</DialogTitle>
        {/* The dialog focuses this on open (first focusable element). */}
        <input
          ref={inputRef}
          role="combobox"
          aria-label="Search for actions"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={current >= 0 ? optionId(current) : undefined}
          placeholder="Search for actions…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(-1)
          }}
          onKeyDown={handleKeyDown}
          className="h-12 w-full border-b bg-transparent px-4 text-sm outline-none desktop:h-10"
        />
        {/* Keys are handled on the input above, so the options need no key handlers. */}
        <div
          id={listId}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
          role="listbox"
          aria-label="Actions"
          className="max-h-64 scroll-fade overflow-y-auto p-1 desktop:max-h-[212px]"
        >
          {rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No actions found</p>
          ) : (
            rows.map((action, i) => (
              <React.Fragment key={action.id}>
                {/* Groups split only the full list: a filtered one is a flat set of matches. */}
                {!needle && i > 0 && rows[i - 1]?.group !== action.group && (
                  <Separator className="my-1" />
                )}
                {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events */}
                <div
                  id={optionId(i)}
                  // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
                  role="option"
                  aria-selected={i === current}
                  aria-disabled={action.disabled || undefined}
                  tabIndex={-1}
                  onMouseMove={() => !action.disabled && setActive(i)}
                  onClick={() => run(action)}
                  className={cn(
                    "flex cursor-default items-center gap-2.5 rounded-3xl px-3 py-2 text-sm desktop:py-1.5 [&_svg]:size-4 [&_svg]:shrink-0",
                    i === current && "bg-accent",
                    action.destructive && "text-destructive",
                    action.disabled && "opacity-50",
                  )}
                >
                  <HugeiconsIcon icon={action.icon} />
                  <span className="min-w-0 flex-1 truncate">{action.label}</span>
                  {/* Hidden on touch screens: no keyboard to press them on. */}
                  {action.keys && (
                    <span className="flex gap-0.5 pointer-coarse:hidden">
                      {shortcutKeys(action.keys).map((key) => (
                        <Kbd key={key} size="sm" className="border border-muted-foreground/60">
                          {key}
                        </Kbd>
                      ))}
                    </span>
                  )}
                </div>
              </React.Fragment>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
