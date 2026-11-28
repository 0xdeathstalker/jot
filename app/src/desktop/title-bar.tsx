import { Cancel01Icon, MinusSignIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import type * as React from "react"

import { Button } from "@/components/ui/button"
import { TopBar } from "@/features/notes/top-bar"

// The desktop window has no Windows frame: the shared top bar drags it, and these buttons hide it
// to the tray (the shell turns minimize and close into hide).
export default function TitleBar(props: Omit<React.ComponentProps<typeof TopBar>, "children">) {
  const appWindow = getCurrentWindow()
  return (
    <TopBar {...props}>
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
    </TopBar>
  )
}
