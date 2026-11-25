// Fails closed: an empty or missing list lets nobody in, so forgetting the secret never opens the app.
export function isEmailAllowed(email: string | null | undefined, allowed: string | undefined) {
  if (!email || !allowed) return false
  const list = allowed.split(",").map((item) => item.trim().toLowerCase())
  return list.includes(email.trim().toLowerCase())
}
