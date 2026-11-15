import { Delete02Icon, MoreVerticalIcon, PinIcon, PinOffIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Note } from "@/sync/index-doc"

type Props = {
  notes: Note[]
  // The list saved on this device is still loading: show placeholder rows.
  loading?: boolean
  activeId: string | null
  onOpen: (id: string) => void
  onTogglePin: (id: string) => void
  onDelete: (id: string) => void
}

const SKELETON_ROWS = 6
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86400],
  ["month", 30 * 86400],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
]

// "just now", "5 minutes ago", "yesterday", "2 months ago". Computed at render: it can lag until the
// list re-renders (any note change or click), which is fine for a list.
function timeAgo(time: number) {
  const seconds = (time - Date.now()) / 1000
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit)
  }
  return "just now"
}

// Every row is two lines (title + preview, or title + details), so rows keep one height.
// Same paddings and line heights as a real row: nothing jumps when the list arrives.
function SkeletonRows() {
  return (
    <ul className="flex flex-col gap-0.5" aria-busy="true" aria-label="Loading notes">
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <li key={i} className="flex flex-col gap-0.5 px-3 py-2">
          <span className="flex h-5 items-center">
            <span className="h-3.5 w-2/3 animate-pulse rounded-full bg-muted" />
          </span>
          <span className="flex h-4 items-center">
            <span className="h-3 w-full animate-pulse rounded-full bg-muted" />
          </span>
        </li>
      ))}
    </ul>
  )
}

// Presentational only: the caller owns the Y.Doc and passes plain callbacks.
export function NoteList({ notes, loading, activeId, onOpen, onTogglePin, onDelete }: Props) {
  if (loading) return <SkeletonRows />
  return (
    <ul className="flex flex-col gap-0.5">
      {notes.map((note) => (
        <li key={note.id} className="group/row relative">
          <button
            type="button"
            aria-current={note.id === activeId ? "page" : undefined}
            onClick={() => onOpen(note.id)}
            className={cn(
              "flex w-full flex-col gap-0.5 rounded-xl px-3 py-2 pr-9 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
              note.id === activeId && "bg-accent",
            )}
          >
            <span
              className={cn(
                "flex items-center gap-1.5 truncate text-sm font-medium",
                !note.title && "text-muted-foreground italic",
              )}
            >
              {note.pinned && <HugeiconsIcon icon={PinIcon} className="size-3 shrink-0" />}
              <span className="truncate">{note.title || "Untitled"}</span>
              {(note.shared || note.role || note.noAccess) && (
                <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-normal text-muted-foreground not-italic">
                  {note.noAccess ? "No access" : note.role === "viewer" ? "View only" : "Shared"}
                </span>
              )}
            </span>
            {note.preview ? (
              <span className="truncate text-xs text-muted-foreground">{note.preview}</span>
            ) : (
              // No body: the title is the whole note, so its length is the note's length.
              <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                {note.id === activeId ? (
                  <>
                    <span className="size-1.5 shrink-0 rounded-full bg-destructive" />
                    Current
                  </>
                ) : (
                  `Edited ${timeAgo(note.updatedAt)}`
                )}
                {` • ${note.title.length} character${note.title.length === 1 ? "" : "s"}`}
              </span>
            )}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Actions for ${note.title || "Untitled"}`}
                  className="absolute top-2 right-1.5"
                />
              }
            >
              <HugeiconsIcon icon={MoreVerticalIcon} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onTogglePin(note.id)}>
                <HugeiconsIcon icon={note.pinned ? PinOffIcon : PinIcon} />
                {note.pinned ? "Unpin" : "Pin"}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => onDelete(note.id)}>
                <HugeiconsIcon icon={Delete02Icon} />
                {note.role ? "Leave note" : "Delete"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      ))}
    </ul>
  )
}
