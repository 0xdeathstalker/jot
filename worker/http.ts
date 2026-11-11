// Small helpers for the JSON API routes (worker/share.ts, worker/join.ts).

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } })

export const fail = (status: number, error: string) => json({ error }, status)

// 32 random bytes as base64url: an unguessable link token.
export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")
}

// Cookie-authenticated writes must come from our own pages (cross-site request forgery): browsers
// always send Origin on fetch POST/DELETE. A missing Origin on a write is refused.
export function writeAllowed(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") return true
  return request.headers.get("Origin") === new URL(request.url).origin
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json()
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
