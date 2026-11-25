import { Add01Icon, Cancel01Icon, MinusSignIcon, Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { getCurrentWindow } from "@tauri-apps/api/window"

import { Button } from "@/components/ui/button"
import { SidebarToggle } from "@/features/notes/sidebar-toggle"
import { formatShortcut as shortcut } from "@/lib/platform"

// The desktop window has no Windows frame: this bar drags it, and its buttons hide it to the tray
// (the shell turns minimize and close into hide). Tauri drags only from the element that has
// `data-tauri-drag-region` itself, so the bar and its spacer both carry it.
// The open note's title sits centred in the bar, like Raycast Notes. pointer-events-none: drags pass
// through it to the bar.
export default function TitleBar({
  title,
  onNew,
  onSearch,
}: {
  title?: string
  onNew: () => void
  onSearch: () => void
}) {
  const appWindow = getCurrentWindow()
  return (
    <div
      data-tauri-drag-region
      className="sticky top-0 z-20 flex h-10 shrink-0 items-center gap-1 bg-background px-2 select-none"
    >
      <SidebarToggle />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="New note"
        title={`New note (${shortcut(["Mod", "N"])})`}
        onClick={onNew}
      >
        <HugeiconsIcon icon={Add01Icon} />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Search notes"
        title={`Search notes (${shortcut(["Mod", "K"])})`}
        onClick={onSearch}
      >
        <HugeiconsIcon icon={Search01Icon} />
      </Button>
      {/* inset-x-32: same on both sides, so it stays centred, clear of the three left buttons. */}
      <span className="pointer-events-none absolute inset-x-32 truncate text-center text-sm text-muted-foreground">
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
