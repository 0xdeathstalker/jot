import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { wipeIfPending } from "@/sync/localData"

import "@/styles/index.css"
import App from "./App.tsx"

// After a sign-out the device's notes are deleted here, before anything opens them.
void wipeIfPending().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
