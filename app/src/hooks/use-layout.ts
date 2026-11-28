import * as React from "react"

import { isDesktop } from "@/lib/platform"

// The three layouts (docs/plans/action-panel.md, "Layout modes"):
// - desktop: the Tauri app, any width. Title in the top bar, toolbar at the bottom.
// - phone: under 640px (Tailwind `sm`). Title in the top bar, toolbar at the bottom.
// - web: 640px or wider, outside the desktop app. Toolbar in the top bar, no title.
export type Layout = "desktop" | "phone" | "web"

const WIDE = "(min-width: 40rem)"

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(WIDE)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

const isWide = () => window.matchMedia(WIDE).matches

export function useLayout(): Layout {
  const wide = React.useSyncExternalStore(subscribe, isWide)
  if (isDesktop()) return "desktop"
  return wide ? "web" : "phone"
}
