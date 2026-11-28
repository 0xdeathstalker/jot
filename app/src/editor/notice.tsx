import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import { useLayout } from "@/hooks/use-layout"
import { isInstalled } from "@/lib/platform"
import { cn } from "@/lib/utils"

export type Notice = { title: string; description?: string }

// Shows a notice; null clears it.
export type Notify = (notice: Notice | null) => void

const SHOW_MS = 4000

// A short message (Raycast style): "Select text to add a link", the image refusals, "Note
// deleted"… One at a time; a new one replaces the old. Pass a stable onClose.
// Where (action-panel.md phase 11, one rule for every toast): top centre, just under the top bar,
// in the desktop app, on phones and in an installed PWA; bottom centre in a wide browser tab,
// whose toolbar is in the top bar. z-60: above dialogs and their blur (z-50).
export function NoticeToast({ notice, onClose }: { notice: Notice | null; onClose: () => void }) {
  const top = useLayout() !== "web" || isInstalled()
  React.useEffect(() => {
    if (!notice) return
    const timer = setTimeout(onClose, SHOW_MS)
    return () => clearTimeout(timer)
  }, [notice, onClose])

  return (
    <output aria-live="polite">
      {notice && (
        <div
          className={cn(
            "fixed left-1/2 z-60 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-start gap-3 rounded-xl bg-raised px-4 py-3 text-popover-foreground shadow-2xl ring-1 ring-foreground/10",
            // Under the top bar: 52px on phones, 50px elsewhere (8px above its buttons).
            top ? "top-[calc(env(safe-area-inset-top)+3.75rem)]" : "bottom-4",
          )}
        >
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
