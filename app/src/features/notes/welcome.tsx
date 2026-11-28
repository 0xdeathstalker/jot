import { Add01Icon, CommandLineIcon, KeyboardIcon, Search01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { Kbd } from "@/components/ui/kbd"
import { isDesktop, shortcutKeys } from "@/lib/platform"

// What the app shows when no note is open (docs/plans/welcome-view.md, design F): the name and one
// line about Jot, a bar that opens the Action Panel, and the few actions that get you started.
// `onHotkey` only in the desktop app: no Global hotkey row without it. The keys are the same arrays
// the action list in app.tsx uses.
// Phone (`phone:`, design M4): no keycaps (no keyboard), 48px bar and rows, rows centred. The
// home indicator is already cleared by the app shell's safe-area padding (app.tsx).
export function Welcome({
  onActions,
  onNew,
  onSearch,
  onHotkey,
}: {
  onActions: () => void
  onNew: () => void
  onSearch: () => void
  onHotkey?: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-8 text-center max-sm:gap-5 phone:gap-7">
      <div className="flex flex-col items-center gap-3">
        <div className="flex items-center gap-3 text-3xl font-bold tracking-tight max-sm:text-2xl phone:text-3xl">
          <Logo />
          Jot
        </div>
        <p className="text-sm text-muted-foreground phone:text-[15px]">
          Fast notes that sync across your devices and <br className="block sm:hidden" /> work
          offline.
        </p>
      </div>

      {/* A button dressed as an input: the real search is the Action Panel it opens. */}
      <button
        type="button"
        onClick={onActions}
        className="flex w-full max-w-100 items-center gap-2.5 rounded-4xl border bg-popover px-3.5 py-2.5 text-left text-sm text-muted-foreground shadow-lg shadow-black/5 transition-colors outline-none hover:border-muted-foreground/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 phone:h-12 phone:py-0 phone:text-[15px]"
      >
        <HugeiconsIcon icon={CommandLineIcon} className="size-[18px] shrink-0 phone:size-5" />
        What would you like to do?
        <Keys keys={["Mod", "K"]} />
      </button>

      <div className="grid w-full max-w-70 gap-0.5 phone:max-w-none">
        <Row
          icon={Add01Icon}
          label="New note"
          // Ctrl+N only in the desktop app: browsers keep it for a new window.
          keys={isDesktop() ? ["Mod", "N"] : undefined}
          onClick={onNew}
        />
        <Row icon={Search01Icon} label="Search notes" keys={["Mod", "P"]} onClick={onSearch} />
        {onHotkey && <Row icon={KeyboardIcon} label="Global hotkey…" onClick={onHotkey} />}
      </div>
    </div>
  )
}

function Row({
  icon,
  label,
  keys,
  onClick,
}: {
  icon: IconSvgElement
  label: string
  keys?: string[]
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-[7px] px-2 py-1.5 text-sm text-muted-foreground outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 phone:h-12 phone:justify-center phone:py-0 phone:text-base"
    >
      <HugeiconsIcon icon={icon} className="size-4 shrink-0 phone:size-5" />
      {label}
      {keys && <Keys keys={keys} />}
    </button>
  )
}

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="ml-auto flex gap-0.5 phone:hidden">
      {shortcutKeys(keys).map((key) => (
        <Kbd key={key} size="sm" className="border border-muted-foreground/60">
          {key}
        </Kbd>
      ))}
    </span>
  )
}

// The app icon (app/public/favicon.svg), in the theme's colours rather than fixed black and white.
function Logo() {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      className="size-10 max-sm:size-8 phone:size-[34px]"
    >
      <rect width="512" height="512" rx="104" className="fill-foreground" />
      <path
        d="M222 140 H322 M322 140 V288 Q322 380 232 380 Q172 380 150 330"
        fill="none"
        strokeWidth="68"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-background"
      />
    </svg>
  )
}
