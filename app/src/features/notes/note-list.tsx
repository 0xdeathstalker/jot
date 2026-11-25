import {
  Delete02Icon,
  MoreVerticalIcon,
  PinIcon,
  PinOffIcon,
  Share08Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { cn } from "cn"
import * as React from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import type { Note } from "@/sync/index-doc"

export type NoteActionHandlers = {
  onTogglePin: (id: string) => void
  onShare: (id: string) => void
  onDelete: (id: string) => void
}

type Props = NoteActionHandlers & {
  notes: Note[]
  // The list saved on this device is still loading: show placeholder rows.
  loading?: boolean
  activeId: string | null
  onOpen: (id: string) => void
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

// Notes saved before `chars` existed: estimate from title + preview until their next edit.
function characters(note: Note) {
  const n = note.chars ?? note.title.length + note.preview.length
  return `${n} character${n === 1 ? "" : "s"}`
}

// Every row is two lines (title + details), so rows keep one height.
// Same paddings and line heights as a real row: nothing jumps when the list arrives.
function SkeletonRows() {
  return (
    <SidebarMenu className="gap-0.5" aria-busy="true" aria-label="Loading notes">
      {Array.from({ length: SKELETON_ROWS }, (_, i) => (
        <SidebarMenuItem key={i} className="flex flex-col gap-0.5 px-3 py-2">
          <span className="flex h-5 items-center">
            <Skeleton className="h-3.5 w-2/3 rounded-full" />
          </span>
          <span className="flex h-4 items-center">
            <Skeleton className="h-3 w-full rounded-full" />
          </span>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}

// A note's two lines, shared by the sidebar list and the note switcher: title (pin, badge) and
// details (current or last edit, characters).
export function NoteRowText({ note, current }: { note: Note; current: boolean }) {
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

// The ⋮ menu (pin, share, delete / leave), shared by the sidebar list and the note switcher.
// `trigger` is the button element it renders as.
export function NoteActions({
  note,
  trigger,
  onTogglePin,
  onShare,
  onDelete,
}: NoteActionHandlers & { note: Note; trigger: React.ReactElement }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger}>
        <HugeiconsIcon icon={MoreVerticalIcon} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-[12px]">
        <DropdownMenuItem onClick={() => onTogglePin(note.id)} className="rounded-4xl">
          <HugeiconsIcon icon={note.pinned ? PinOffIcon : PinIcon} />
          {note.pinned ? "Unpin" : "Pin"}
        </DropdownMenuItem>
        {/* Only the owner shares (a note with a `role` belongs to someone else). */}
        {!note.role && (
          <DropdownMenuItem onClick={() => onShare(note.id)} className="rounded-4xl">
            <HugeiconsIcon icon={Share08Icon} />
            Share
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onDelete(note.id)}
          className="rounded-4xl"
        >
          <HugeiconsIcon icon={Delete02Icon} />
          {note.role ? "Leave note" : "Delete"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Presentational only: the caller owns the Y.Doc and passes plain callbacks.
export function NoteList({
  notes,
  loading,
  activeId,
  onOpen,
  onTogglePin,
  onShare,
  onDelete,
}: Props) {
  if (loading) return <SkeletonRows />
  return (
    <SidebarMenu className="gap-0.5">
      {notes.map((note) => (
        <SidebarMenuItem key={note.id}>
          {/* Two lines per row: undo the primitive's fixed height and single-line layout. */}
          <SidebarMenuButton
            isActive={note.id === activeId}
            aria-current={note.id === activeId ? "page" : undefined}
            onClick={() => onOpen(note.id)}
            className="h-auto flex-col items-stretch gap-0.5 rounded-3xl py-2 font-normal data-active:font-normal"
          >
            <NoteRowText note={note} current={note.id === activeId} />
          </SidebarMenuButton>
          <NoteActions
            note={note}
            onTogglePin={onTogglePin}
            onShare={onShare}
            onDelete={onDelete}
            trigger={
              <SidebarMenuAction
                aria-label={`Actions for ${note.title || "Untitled"}`}
                className="top-2.5! right-1.5"
              />
            }
          />
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}
