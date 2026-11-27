import type { IconSvgElement } from "@hugeicons/react"
import * as React from "react"

import { matchesShortcut } from "@/lib/platform"

// One row of the Action Panel (docs/plans/action-panel.md). The same list drives the panel and the
// keyboard shortcuts, so a key hint can never drift from the key that works.
export type Action = {
  id: string
  label: string
  icon: IconSvgElement
  // ["Mod", "Shift", "P"]: the format of shortcutKeys / formatShortcut.
  keys?: string[]
  // Rows are split into groups by separators.
  group: number
  destructive?: boolean
  disabled?: boolean
  hidden?: boolean
  run: () => void
}

// Runs the action whose keys match a key press, anywhere in the app. Skips presses something else
// already handled (the editor takes Ctrl/⌘+B for Bold, for example).
export function useActionShortcuts(actions: Action[]) {
  // The listener reads the latest list without re-subscribing every render.
  const latest = React.useRef(actions)
  React.useEffect(() => {
    latest.current = actions
  })
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      const action = latest.current.find(
        (a) => a.keys && !a.hidden && !a.disabled && matchesShortcut(event, a.keys),
      )
      if (!action) return
      event.preventDefault()
      action.run()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])
}
