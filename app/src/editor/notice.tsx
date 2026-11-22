import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

export type Notice = { title: string; description?: string }

// Shows a notice; null clears it.
export type Notify = (notice: Notice | null) => void

const SHOW_MS = 4000

// A short message at the bottom of the screen (Raycast style; on phones just above the toolbar): "Select text to add a link", and later
// the image refusals. One at a time; a new one replaces the old. Pass a stable onClose.
export function NoticeToast({ notice, onClose }: { notice: Notice | null; onClose: () => void }) {
  React.useEffect(() => {
    if (!notice) return
    const timer = setTimeout(onClose, SHOW_MS)
    return () => clearTimeout(timer)
  }, [notice, onClose])

  return (
    <output aria-live="polite">
      {notice && (
        <div className="fixed bottom-4 left-1/2 z-50 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-start gap-3 rounded-xl bg-popover px-4 py-3 text-popover-foreground shadow-2xl ring-1 ring-foreground/10 max-sm:bottom-[calc(max(0.5rem,env(safe-area-inset-bottom))+3.5rem)]">
          <button
            type="button"
            aria-label="Dismiss"
            onClick={onClose}
            className="mt-0.5 text-muted-foreground hover:text-foreground"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
          </button>
          <div>
            <p className="text-sm font-medium">{notice.title}</p>
            {notice.description && (
              <p className="text-sm text-muted-foreground">{notice.description}</p>
            )}
          </div>
        </div>
      )}
    </output>
  )
}
