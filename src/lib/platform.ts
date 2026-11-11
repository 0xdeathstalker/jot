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
