import { Add01Icon, CommandLineIcon, Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import type * as React from "react"

import { Button } from "@/components/ui/button"
import { useLayout } from "@/hooks/use-layout"
import { formatShortcut as shortcut, isDesktop } from "@/lib/platform"

// The one bar on every platform (web, phone, desktop), like Raycast Notes: Actions, New note and
// Search notes on the left, the open note's title centred. The desktop title bar adds the window
// buttons as `children` (desktop/title-bar.tsx). `data-tauri-drag-region` drags the frameless
// desktop window from the bar and its spacer; elsewhere it does nothing. The title is
// pointer-events-none so drags pass through it.
// The top padding keeps it clear of the iPhone notch (the bar is sticky at the very top).
export function TopBar({
  title,
  onActions,
  onNew,
  onSearch,
  children,
}: {
  title?: string
  onActions: () => void
  onNew: () => void
  onSearch: () => void
  children?: React.ReactNode
}) {
  const layout = useLayout()
  return (
    <div
      data-tauri-drag-region
      className="sticky top-0 z-20 box-content flex h-10 shrink-0 items-center gap-1 bg-background px-2 pt-[env(safe-area-inset-top)] select-none"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Actions"
        title={`Actions (${shortcut(["Mod", "K"])})`}
        onClick={onActions}
      >
        <HugeiconsIcon icon={CommandLineIcon} />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="New note"
        // Ctrl+N only in the desktop app: browsers keep it for a new window.
        title={isDesktop() ? `New note (${shortcut(["Mod", "N"])})` : "New note"}
        onClick={onNew}
      >
        <HugeiconsIcon icon={Add01Icon} />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Search notes"
        title={`Search notes (${shortcut(["Mod", "P"])})`}
        onClick={onSearch}
      >
        <HugeiconsIcon icon={Search01Icon} />
      </Button>
      {/* inset-x-32: same on both sides, so it stays centred, clear of the three left buttons.
          Web: the editor puts its formatting toolbar here instead of the title (editor.tsx). */}
      {layout === "web" ? (
        <div id="top-bar-centre" className="absolute inset-x-32 flex justify-center" />
      ) : (
        <span className="pointer-events-none absolute inset-x-32 truncate text-center text-sm text-muted-foreground">
          {title}
        </span>
      )}
      <div data-tauri-drag-region className="h-full flex-1" />
      {children}
    </div>
  )
}
