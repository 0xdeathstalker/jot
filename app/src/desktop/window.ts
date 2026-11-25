import { getCurrentWebview } from "@tauri-apps/api/webview"
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window"

// Like Raycast Notes: a dialog taller than the window grows the window while it is open. Reads the
// size from the page (frameless: page size = window size, in logical px), so no permission to read
// it. Resolves to the function that puts the old height back (a no-op if it did not grow).
// ponytail: grows downwards only; near the bottom of the screen the extra part can go off-screen.
export async function growWindowTo(height: number) {
  const before = window.innerHeight
  if (before >= height) return () => {}
  // WebView2 paints new space white until the page repaints: give it the page's colour first
  // (read now, so it follows the theme).
  const [r, g, b] = getComputedStyle(document.body).backgroundColor.match(/\d+/g)!.map(Number)
  await getCurrentWebview().setBackgroundColor([r, g, b, 255])
  const appWindow = getCurrentWindow()
  await appWindow.setSize(new LogicalSize(window.innerWidth, height))
  return () => void appWindow.setSize(new LogicalSize(window.innerWidth, before))
}
