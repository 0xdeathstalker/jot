// True in an ordinary iPhone/iPad browser tab, false in the installed Home Screen app and on every
// other platform. iPadOS pretends to be a Mac, so it is recognised by "Macintosh" plus a touch screen.
export function isIosBrowser(): boolean {
  const ua = navigator.userAgent
  const iosDevice =
    /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1)
  const installed =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  return iosDevice && !installed
}

// Apple keyboards: shortcuts read ⌘ ⌥ ⇧ instead of Ctrl / Alt / Shift.
export function isApple(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
}

const appleKeys: Record<string, string> = { Mod: "⌘", Alt: "⌥", Shift: "⇧" }

// ["Mod", "Shift", "S"] -> "⌘⇧S" on Apple, "Ctrl+Shift+S" elsewhere ("Mod" is Tiptap's name for it).
export function formatShortcut(keys: string[]): string {
  return isApple()
    ? keys.map((k) => appleKeys[k] ?? k).join("")
    : keys.map((k) => (k === "Mod" ? "Ctrl" : k)).join("+")
}
