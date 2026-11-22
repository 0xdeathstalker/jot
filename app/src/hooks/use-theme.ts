import * as React from "react"

// Same rule as the inline script in index.html: a saved choice wins, otherwise follow the system.
// If one changes, change the other.
const KEY = "jot-theme"
const SYSTEM_DARK = "(prefers-color-scheme: dark)"

function apply(isDark: boolean) {
  document.documentElement.classList.toggle("dark", isDark)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", isDark ? "#1E1E1C" : "#F3EEE3")
}

const listeners = new Set<() => void>()

// The startup script in index.html already re-applies the theme when the system changes (it registered
// first, so it runs first); here we only re-read the class.
function subscribe(onChange: () => void) {
  const mql = window.matchMedia(SYSTEM_DARK)
  listeners.add(onChange)
  mql.addEventListener("change", onChange)
  return () => {
    listeners.delete(onChange)
    mql.removeEventListener("change", onChange)
  }
}

// The `.dark` class (set by the startup script) is the source of truth, so the first render is right.
const isDarkNow = () => document.documentElement.classList.contains("dark")

function setDark(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "dark" : "light")
  } catch {
    // Storage blocked: the choice lasts until reload.
  }
  apply(on)
  listeners.forEach((l) => l())
}

export function useTheme(): [isDark: boolean, setDark: (on: boolean) => void] {
  return [React.useSyncExternalStore(subscribe, isDarkNow), setDark]
}
