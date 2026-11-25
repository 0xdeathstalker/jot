import { Cancel01Icon, MinusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { getCurrentWindow } from "@tauri-apps/api/window"

import { Button } from "@/components/ui/button"
import { SidebarToggle } from "@/features/notes/sidebar-toggle"

// The desktop window has no Windows frame: this bar drags it, and its buttons hide it to the tray
// (the shell turns minimize and close into hide). Tauri drags only from the element that has
// `data-tauri-drag-region` itself, so the bar and its spacer both carry it.
// The open note's title sits centred in the bar, like Raycast Notes. pointer-events-none: drags pass
// through it to the bar.
export default function TitleBar({ title }: { title?: string }) {
  const appWindow = getCurrentWindow()
  return (
    <div
      data-tauri-drag-region
      className="sticky top-0 z-20 flex h-10 shrink-0 items-center gap-1 bg-background px-2 select-none"
    >
      <SidebarToggle />
      <span className="pointer-events-none absolute inset-x-24 truncate text-center text-sm text-muted-foreground">
        {title}
      </span>
      <div data-tauri-drag-region className="h-full flex-1" />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Minimize"
        title="Minimize"
        onClick={() => void appWindow.minimize()}
      >
        <HugeiconsIcon icon={MinusSignIcon} />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Close"
        title="Close (stays in the tray)"
        onClick={() => void appWindow.close()}
      >
        <HugeiconsIcon icon={Cancel01Icon} />
      </Button>
    </div>
  )
}
