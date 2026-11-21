import * as React from "react"

const MOBILE_QUERY = "(max-width: 767px)" // Tailwind `md` is 768 px

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

// Read during render: phones get the sheet on the first render, with no desktop render first.
export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, () => window.matchMedia(MOBILE_QUERY).matches)
}
