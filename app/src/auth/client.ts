import { createAuthClient } from "better-auth/react"

// Same origin as the app, so no baseURL. The session lives in an HttpOnly cookie that the browser
// also sends on the WebSocket upgrade (docs/plans/phase-4-auth.md).
export const authClient = createAuthClient()
