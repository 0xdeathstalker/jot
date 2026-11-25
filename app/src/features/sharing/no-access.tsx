import { Button } from "@/components/ui/button"

// Shown instead of the editor when the owner has removed us from the note.
export function NoAccess({ onRemove }: { onRemove: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p role="alert" className="font-medium">
        You no longer have access to this note.
      </p>
      <p className="max-w-sm text-sm text-muted-foreground">
        The owner removed you. Removing it from your list also deletes the copy on this device.
      </p>
      <Button variant="destructive" onClick={onRemove}>
        Remove from my list
      </Button>
    </div>
  )
}
