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

// ["Mod", "Shift", "S"] -> ["⌘", "⇧", "S"] on Apple, ["Ctrl", "Shift", "S"] elsewhere ("Mod" is
// Tiptap's name for it). One entry per keycap.
export function shortcutKeys(keys: string[]): string[] {
  return isApple()
    ? keys.map((k) => appleKeys[k] ?? k)
    : keys.map((k) => (k === "Mod" ? "Ctrl" : k))
}

// The same as one string: "⌘⇧S" on Apple, "Ctrl+Shift+S" elsewhere (for title attributes).
export function formatShortcut(keys: string[]): string {
  return shortcutKeys(keys).join(isApple() ? "" : "+")
}

// True inside the Windows desktop app (the Tauri shell injects this global before the page runs).
export function isDesktop(): boolean {
  return "__TAURI_INTERNALS__" in window
}
