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
import type { Note } from "@/sync/indexDoc"

type Props = {
  notes: Note[]
  activeId: string | null
  onOpen: (id: string) => void
  onTogglePin: (id: string) => void
  onDelete: (id: string) => void
}

// Presentational only: the caller owns the Y.Doc and passes plain callbacks.
export function NoteList({ notes, activeId, onOpen, onTogglePin, onDelete }: Props) {
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
            </span>
            {note.preview && (
              <span className="truncate text-xs text-muted-foreground">{note.preview}</span>
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
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      ))}
    </ul>
  )
}
