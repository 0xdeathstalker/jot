import {
  Add01Icon,
  CommandLineIcon,
  MoreVerticalIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import type * as React from "react"

import { ShortcutTooltip } from "@/components/shortcut-tooltip"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useLayout } from "@/hooks/use-layout"
import { isDesktop } from "@/lib/platform"

// Phone buttons look like the formatting toolbar: a bordered frame (bar's p-0.5, rounded-[10px],
// bg-popover) around a 36px button with a 20px icon and the toolbar's hover / open shades. The
// inner radius is 10px less padding and border (7px), so the corners run parallel. The dark: and
// aria-expanded: forms override the ghost button's own (dark:hover:bg-muted/50, aria-expanded:bg-muted).
const PHONE_ITEM = "focus:bg-foreground/10 focus:text-foreground"
const FRAME = "rounded-[10px] border bg-popover p-0.5"
// Web and desktop: the three buttons share one such frame, at the toolbar's 28px size.
const BAR_BUTTON =
  "size-7 rounded-[7px] hover:bg-foreground/10 dark:hover:bg-foreground/10 aria-expanded:bg-foreground/15"
const PHONE_BUTTON =
  "rounded-[7px] [&_svg]:size-5 hover:bg-foreground/10 dark:hover:bg-foreground/10 aria-expanded:bg-foreground/15"

// Web and desktop: one of the three framed buttons, with its name and keys on hover.
function BarButton({
  label,
  keys,
  icon,
  onClick,
}: {
  label: string
  keys?: string[]
  icon: IconSvgElement
  onClick: () => void
}) {
  return (
    <ShortcutTooltip label={label} keys={keys} side="bottom">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        className={BAR_BUTTON}
        onClick={onClick}
      >
        <HugeiconsIcon icon={icon} />
      </Button>
    </ShortcutTooltip>
  )
}

// The one bar on every platform (web, phone, desktop), like Raycast Notes: Actions, New note and
// Search notes on the left, the open note's title centred. The desktop title bar adds the window
// buttons as `children` (desktop/title-bar.tsx). `data-tauri-drag-region` drags the frameless
// desktop window from the bar and its spacer; elsewhere it does nothing. The title is
// pointer-events-none so drags pass through it.
// Phone (owner, 2026-11-28): bigger touch buttons, New note alone on the left, Actions and Search
// in a ⋮ menu on the right, so the title sits truly centred between two buttons.
// The top padding keeps it clear of the iPhone notch. It sits above the note's scroll box (app.tsx).
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
  const phone = layout === "phone"

  return (
    <div
      data-tauri-drag-region
      className={`relative z-20 box-content flex shrink-0 items-center gap-1 bg-background px-2 select-none ${phone ? "h-11 pt-[calc(env(safe-area-inset-top)+0.5rem)]" : "h-[2.125rem] pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-2"}`}
    >
      {phone ? (
        <div className={FRAME}>
          <Button
            variant="ghost"
            size="icon"
            aria-label="New note"
            onClick={onNew}
            className={PHONE_BUTTON}
          >
            <HugeiconsIcon icon={Add01Icon} />
          </Button>
        </div>
      ) : (
        // The provider lets the next button's tooltip open at once while one is showing.
        <TooltipProvider>
          <div className={`flex gap-0.5 ${FRAME}`}>
            <BarButton
              label="Actions"
              keys={["Mod", "K"]}
              icon={CommandLineIcon}
              onClick={onActions}
            />
            <BarButton
              label="New note"
              // Ctrl+N only in the desktop app: browsers keep it for a new window.
              keys={isDesktop() ? ["Mod", "N"] : undefined}
              icon={Add01Icon}
              onClick={onNew}
            />
            <BarButton
              label="Search notes"
              keys={["Mod", "P"]}
              icon={Search01Icon}
              onClick={onSearch}
            />
          </div>
        </TooltipProvider>
      )}
      {/* Same inset on both sides, so it stays centred: inset-x-32 clears three buttons on the
          left, inset-x-14 one button on each side (phone).
          Web: the editor puts its formatting toolbar here instead of the title (editor.tsx). */}
      {layout === "web" ? (
        <div id="top-bar-centre" className="absolute inset-x-32 flex justify-center" />
      ) : (
        <span
          className={`pointer-events-none absolute truncate text-center text-sm text-muted-foreground ${phone ? "inset-x-14" : "inset-x-32"}`}
        >
          {title}
        </span>
      )}
      <div data-tauri-drag-region className="h-full flex-1" />
      {phone && (
        <div className={FRAME}>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="More" className={PHONE_BUTTON} />
              }
            >
              <HugeiconsIcon icon={MoreVerticalIcon} />
            </DropdownMenuTrigger>
            {/* finalFocus false: both items open a dialog, which takes focus; returning it to the
              trigger would pull it back out. */}
            <DropdownMenuContent
              align="end"
              finalFocus={false}
              className="w-auto rounded-3xl bg-raised"
            >
              <DropdownMenuItem onClick={onActions} className={PHONE_ITEM}>
                <HugeiconsIcon icon={CommandLineIcon} />
                Actions
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onSearch} className={PHONE_ITEM}>
                <HugeiconsIcon icon={Search01Icon} />
                Search notes
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      {children}
    </div>
  )
}
