import type * as React from "react"

import { Kbd } from "@/components/ui/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { shortcutKeys } from "@/lib/platform"

// A button's name, and its keys if it has any, on hover (shadcn Tooltip; arrow removed, owner).
// For the top bar and the formatting toolbar.
// `children` is the button itself (Base UI `render`: it becomes the trigger, no extra element).
// The tooltip is inverted (foreground on background), so its keycaps are too. `side` is a
// preference: Base UI flips it when there is no room (the toolbar at the bottom or in the top bar).
export function ShortcutTooltip({
  label,
  keys,
  side = "top",
  children,
}: {
  label: string
  keys?: string[]
  side?: "top" | "bottom"
  children: React.ReactElement
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>
        {label}
        {keys && (
          <span className="flex gap-0.5">
            {shortcutKeys(keys).map((key) => (
              <Kbd
                key={key}
                size="sm"
                className="border-background/40 bg-transparent text-background"
              >
                {key}
              </Kbd>
            ))}
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  )
}
