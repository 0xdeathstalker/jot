import * as React from "react"

// Scrollbars that show only while scrolling, like Raycast Notes (styles/index.css `.scroll-fade`).
// One capture listener on the document sees every element's scroll (scroll events do not bubble,
// but capture still reaches them), so the note and the dialog lists need no wiring of their own:
// any `.scroll-fade` element gets `data-scrolling` until 800ms after its last scroll.
const FADE_MS = 800

export function useScrollFade() {
  React.useEffect(() => {
    const timers = new WeakMap<Element, number>()
    const onScroll = (event: Event) => {
      const el = event.target
      if (!(el instanceof Element) || !el.classList.contains("scroll-fade")) return
      el.setAttribute("data-scrolling", "")
      clearTimeout(timers.get(el))
      timers.set(
        el,
        window.setTimeout(() => el.removeAttribute("data-scrolling"), FADE_MS),
      )
    }
    document.addEventListener("scroll", onScroll, { capture: true, passive: true })
    return () => document.removeEventListener("scroll", onScroll, { capture: true })
  }, [])
}
