import { getServerByName } from "partyserver"

// Closes every open connection of `userId` on a note (used when someone is removed from it).
export async function kickUser(env: Env, noteId: string, userId: string) {
  const room = await getServerByName(env.NoteRoom, noteId)
  await room.kick(userId)
}
