import { invoke } from "@tauri-apps/api/core"
import * as React from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// The shell stores hotkeys as "control+alt+KeyJ" (tauri/src/lib.rs, get_hotkey / set_hotkey).
const NAMES: Record<string, string> = { control: "Ctrl", alt: "Alt", shift: "Shift", super: "Win" }

// "shift+control+alt+KeyJ" -> "Ctrl+Alt+Shift+J"
function formatHotkey(hotkey: string): string {
  const parts = hotkey.split("+")
  const key = parts.pop() ?? ""
  const mods = ["control", "alt", "shift", "super"].filter((m) => parts.includes(m))
  return [...mods.map((m) => NAMES[m]), key.replace(/^(Key|Digit)/, "")].join("+")
}

// A key press -> "control+alt+KeyJ". Null while only modifiers are down, or without Ctrl or Alt
// (Shift+letter alone would steal typing everywhere).
function readHotkey(event: React.KeyboardEvent): string | null {
  if (/^(Control|Alt|Shift|Meta)/.test(event.code)) return null
  if (!event.ctrlKey && !event.altKey) return null
  const mods = [event.ctrlKey && "control", event.altKey && "alt", event.shiftKey && "shift"]
  return [...mods.filter(Boolean), event.code].join("+")
}

const ERRORS: Record<string, string> = {
  taken: "Another app already uses that shortcut. Try another.",
  invalid: "That key cannot be used. Try a letter, number or F-key.",
}

// Gear menu > Global hotkey (desktop only). Focus the box and press the new shortcut.
export default function HotkeyDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [hotkey, setHotkey] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)

  // Mounted fresh on each open (account-footer.tsx renders it only while open).
  React.useEffect(() => {
    void invoke<string>("get_hotkey").then(setHotkey)
  }, [])

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" || event.key === "Tab") return // close / move on as usual
    event.preventDefault()
    const next = readHotkey(event)
    if (!next) {
      setMessage("Hold Ctrl or Alt, then press a key.")
      return
    }
    invoke<string>("set_hotkey", { hotkey: next }).then(
      (saved) => {
        setHotkey(saved)
        setMessage("Saved.")
      },
      (error: unknown) => setMessage(ERRORS[String(error)] ?? "That did not work. Try again."),
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Global hotkey</DialogTitle>
          <DialogDescription>
            Brings Jot up from any app. Click the box, then press it.
          </DialogDescription>
        </DialogHeader>
        <button
          type="button"
          onKeyDown={handleKeyDown}
          aria-describedby="hotkey-message"
          className="flex h-12 items-center justify-center rounded-xl border bg-muted font-mono text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {hotkey ? formatHotkey(hotkey) : "…"}
        </button>
        <output id="hotkey-message" className="block min-h-5 text-sm text-muted-foreground">
          {message}
        </output>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}
