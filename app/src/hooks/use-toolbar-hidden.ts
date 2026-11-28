import * as React from "react"

// Whether the formatting toolbar is hidden (phone and desktop layouts). Remembered on this device
// (owner, 2026-11-28); every editor, the Action Panel row and other tabs agree.
const KEY = "jot-toolbar-hidden"

const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) onChange()
  }
  window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener("storage", onStorage)
  }
}

// Storage blocked: fall back to this session's choice.
let fallback = false

function isHidden() {
  try {
    return localStorage.getItem(KEY) === "1"
  } catch {
    return fallback
  }
}

function setHidden(on: boolean) {
  fallback = on
  try {
    if (on) localStorage.setItem(KEY, "1")
    else localStorage.removeItem(KEY)
  } catch {
    // Storage blocked: the choice lasts until reload.
  }
  listeners.forEach((l) => l())
}

export function useToolbarHidden(): [hidden: boolean, setHidden: (on: boolean) => void] {
  return [React.useSyncExternalStore(subscribe, isHidden), setHidden]
}
