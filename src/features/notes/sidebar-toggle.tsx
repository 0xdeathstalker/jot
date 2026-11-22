import { Kbd } from "@/components/ui/kbd"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { shortcutKeys } from "@/lib/platform"

// The sidebar toggle, with its Ctrl/⌘+B hint on hover (sidebar.tsx handles the key itself).
export function SidebarToggle() {
  return (
    <Tooltip>
      <TooltipTrigger render={<SidebarTrigger aria-label="Toggle notes" />} />
      {/* Keys only (owner, 2026-11-22); the button's aria-label names it. */}
      <TooltipContent side="bottom" className="px-1.5">
        {shortcutKeys(["Mod", "B"]).map((key) => (
          <Kbd key={key}>{key}</Kbd>
        ))}
      </TooltipContent>
    </Tooltip>
  )
}
