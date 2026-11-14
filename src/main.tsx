import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { registerSW } from "virtual:pwa-register"

import { wipeIfPending } from "@/sync/local-data"

import "@/styles/index.css"
import App from "./app.tsx"

// Offline app shell. A new version installs silently and the page reloads onto it (autoUpdate).
// An installed app can stay open for days, so also look for updates hourly and on every return.
const HOUR = 60 * 60 * 1000
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const check = () => void registration.update().catch(() => {}) // offline: try again later
    setInterval(check, HOUR)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") check()
    })
  },
})

// After a sign-out the device's notes are deleted here, before anything opens them.
void wipeIfPending().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
