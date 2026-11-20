// How other people see you in a shared note: a name and a colour that stay the same on every
// device (the colour comes from the user id, not from chance). CollaborationCaret needs #rrggbb.
const COLORS = [
  "#e11d48",
  "#ea580c",
  "#ca8a04",
  "#16a34a",
  "#db2777",
  "#0891b2",
  "#7c3aed",
  "#c026d3",
]

export type CaretUser = { name: string; color: string }

export function caretUser(user: { id: string; name: string; email: string }): CaretUser {
  let hash = 0
  for (const char of user.id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return {
    name: user.name || user.email.split("@")[0],
    color: COLORS[hash % COLORS.length],
  }
}
