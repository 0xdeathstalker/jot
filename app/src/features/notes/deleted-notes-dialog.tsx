import type { Doc } from "yjs"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { timeAgo } from "@/lib/time-ago"
import { undelete, useDeletedNotes } from "@/sync/index-doc"

// Action Panel > Show Recently Deleted Notes. Deleting is a soft delete, so a note comes back whole.
// Mounted only while open: the deleted list is read only then.
export function DeletedNotesDialog({
  doc,
  onOpenChange,
  onRestored,
}: {
  doc: Doc
  onOpenChange: (open: boolean) => void
  onRestored: (id: string) => void
}) {
  const notes = useDeletedNotes(doc)
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recently deleted</DialogTitle>
          <DialogDescription>Restore a note to put it back in your list.</DialogDescription>
        </DialogHeader>
        {notes.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">No deleted notes</p>
        ) : (
          <ul className="-mx-2 flex max-h-56 scroll-fade flex-col gap-0.5 overflow-y-auto">
            {notes.map((note) => (
              <li key={note.id} className="flex items-center gap-2 rounded-3xl px-2 py-1.5">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    className={
                      note.title ? "truncate font-medium" : "truncate text-muted-foreground"
                    }
                  >
                    {note.title || "Untitled"}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {/* Deleted before deletedAt existed: only the last edit is known. */}
                    {note.deletedAt
                      ? `Deleted ${timeAgo(note.deletedAt)}`
                      : `Edited ${timeAgo(note.updatedAt)}`}
                  </span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Restore ${note.title || "Untitled"}`}
                  onClick={() => {
                    undelete(doc, note.id)
                    onOpenChange(false)
                    onRestored(note.id)
                  }}
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
