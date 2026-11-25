import { Cancel01Icon, Share01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { isIosBrowser } from "@/lib/platform"

// iOS has no install prompt, so we explain it once. Chrome and Edge show their own install icon.
const DISMISSED_KEY = "jot-install-hint-dismissed"

function shouldShow(): boolean {
  if (!isIosBrowser()) return false
  try {
    return !localStorage.getItem(DISMISSED_KEY)
  } catch {
    return true // storage blocked: show it; dismissing then lasts until the next reload
  }
}

export function InstallHint() {
  const [visible, setVisible] = React.useState(shouldShow)
  if (!visible) return null

  const dismiss = () => {
    setVisible(false)
    try {
      localStorage.setItem(DISMISSED_KEY, "1")
    } catch {
      // ignored
    }
  }

  return (
    <div
      role="note"
      className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-30 flex items-center gap-3 rounded-2xl border bg-background p-3 text-sm shadow-lg"
    >
      <p className="flex-1">
        Install Jot: tap{" "}
        <HugeiconsIcon icon={Share01Icon} className="inline size-4 align-text-bottom" />{" "}
        <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
      </p>
      <Button variant="ghost" size="icon-sm" aria-label="Dismiss install hint" onClick={dismiss}>
        <HugeiconsIcon icon={Cancel01Icon} />
      </Button>
    </div>
  )
}
