import { db } from "@/lib/db"
import { friendship, player } from "@/lib/db/schema"
import { and, eq, or } from "drizzle-orm"
import { HttpError } from "@/lib/session"
import { id } from "@/lib/api"
import { publish } from "@/lib/events"

type PlayerRow = typeof player.$inferSelect

async function playerById(playerId: string): Promise<PlayerRow | null> {
  const [row] = await db.select().from(player).where(eq(player.id, playerId)).limit(1)
  return row ?? null
}

/** List all friendships (accepted + pending, incoming + outgoing) for a player. */
export async function listFriends(playerId: string) {
  const rows = await db
    .select()
    .from(friendship)
    .where(or(eq(friendship.requesterId, playerId), eq(friendship.addresseeId, playerId)))

  const enriched = []
  for (const f of rows) {
    const otherId = f.requesterId === playerId ? f.addresseeId : f.requesterId
    const other = await playerById(otherId)
    enriched.push({
      id: f.id,
      status: f.status,
      direction: f.requesterId === playerId ? "outgoing" : "incoming",
      friend: other
        ? { id: other.id, username: other.username, displayName: other.displayName, rating: other.rating, status: other.status }
        : null,
      createdAt: f.createdAt,
    })
  }
  return enriched
}

export async function sendRequest(requester: PlayerRow, addresseeUsername: string) {
  const [addressee] = await db
    .select()
    .from(player)
    .where(eq(player.username, addresseeUsername))
    .limit(1)
  if (!addressee) throw new HttpError(404, "Player not found")
  if (addressee.id === requester.id) throw new HttpError(400, "Cannot friend yourself")

  const existing = await db
    .select()
    .from(friendship)
    .where(
      or(
        and(eq(friendship.requesterId, requester.id), eq(friendship.addresseeId, addressee.id)),
        and(eq(friendship.requesterId, addressee.id), eq(friendship.addresseeId, requester.id)),
      ),
    )
    .limit(1)
  if (existing.length) throw new HttpError(409, "Friendship already exists")

  const [created] = await db
    .insert(friendship)
    .values({
      id: id("friend"),
      requesterId: requester.id,
      addresseeId: addressee.id,
      status: "pending",
    })
    .returning()

  publish(addressee.userId, { type: "friend_request", from: requester.displayName })
  return created
}

export async function respondToRequest(me: PlayerRow, friendshipId: string, accept: boolean) {
  const [f] = await db.select().from(friendship).where(eq(friendship.id, friendshipId)).limit(1)
  if (!f) throw new HttpError(404, "Friend request not found")
  if (f.addresseeId !== me.id) throw new HttpError(403, "Only the addressee can respond")
  if (f.status !== "pending") throw new HttpError(409, "Request already resolved")

  const [updated] = await db
    .update(friendship)
    .set({ status: accept ? "accepted" : "declined", updatedAt: new Date() })
    .where(eq(friendship.id, friendshipId))
    .returning()

  if (accept) {
    const requester = await playerById(f.requesterId)
    if (requester) publish(requester.userId, { type: "friend_accepted", by: me.displayName })
  }
  return updated
}

export async function removeFriend(me: PlayerRow, friendshipId: string) {
  const [f] = await db.select().from(friendship).where(eq(friendship.id, friendshipId)).limit(1)
  if (!f) throw new HttpError(404, "Friendship not found")
  if (f.requesterId !== me.id && f.addresseeId !== me.id) {
    throw new HttpError(403, "Not your friendship")
  }
  await db.delete(friendship).where(eq(friendship.id, friendshipId))
}
