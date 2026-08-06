import { db } from "@/lib/db"
import { matchmakingTicket, match, matchPlayer, player } from "@/lib/db/schema"
import { and, asc, eq } from "drizzle-orm"
import { id } from "@/lib/api"
import { publish } from "@/lib/events"

/**
 * Rating tolerance widens the longer a ticket waits, so nobody is stuck
 * forever. Starts at ±100 and grows by 50 every 5 seconds up to ±1000.
 */
export function ratingTolerance(enqueuedAt: Date, now = Date.now()): number {
  const waitedSec = Math.max(0, (now - enqueuedAt.getTime()) / 1000)
  return Math.min(1000, 100 + Math.floor(waitedSec / 5) * 50)
}

export type MatchmakingResult = {
  scanned: number
  matchesCreated: number
  matchedTicketIds: string[]
}

/**
 * One matchmaking "tick": scans searching tickets per game mode, greedily
 * pairs the closest-rated compatible players, and creates matches for them.
 * Idempotent and safe to call repeatedly (e.g. from a cron/worker).
 */
export async function runMatchmakingTick(): Promise<MatchmakingResult> {
  const searching = await db
    .select()
    .from(matchmakingTicket)
    .where(eq(matchmakingTicket.status, "searching"))
    .orderBy(asc(matchmakingTicket.enqueuedAt))

  const now = Date.now()
  const byMode = new Map<string, typeof searching>()
  for (const t of searching) {
    const list = byMode.get(t.gameMode) ?? []
    list.push(t)
    byMode.set(t.gameMode, list)
  }

  const matchedTicketIds: string[] = []
  let matchesCreated = 0

  for (const [gameMode, tickets] of byMode) {
    // sort by rating so neighbours are the closest candidates
    const pool = [...tickets].sort((a, b) => a.rating - b.rating)
    const used = new Set<string>()

    for (let i = 0; i < pool.length; i++) {
      const a = pool[i]
      if (used.has(a.id)) continue

      for (let j = i + 1; j < pool.length; j++) {
        const b = pool[j]
        if (used.has(b.id)) continue

        const diff = Math.abs(a.rating - b.rating)
        const tol = Math.min(ratingTolerance(a.enqueuedAt, now), ratingTolerance(b.enqueuedAt, now))
        if (diff <= tol) {
          await createMatch(gameMode, a, b)
          used.add(a.id)
          used.add(b.id)
          matchedTicketIds.push(a.id, b.id)
          matchesCreated++
          break
        }
      }
    }
  }

  return { scanned: searching.length, matchesCreated, matchedTicketIds }
}

async function createMatch(
  gameMode: string,
  a: typeof matchmakingTicket.$inferSelect,
  b: typeof matchmakingTicket.$inferSelect,
) {
  const matchId = id("match")

  await db.insert(match).values({
    id: matchId,
    gameMode,
    status: "active",
  })

  await db.insert(matchPlayer).values([
    {
      id: id("mp"),
      matchId,
      playerId: a.playerId,
      userId: a.userId,
      team: 0,
      ratingBefore: a.rating,
    },
    {
      id: id("mp"),
      matchId,
      playerId: b.playerId,
      userId: b.userId,
      team: 1,
      ratingBefore: b.rating,
    },
  ])

  const updatedAt = new Date()
  for (const t of [a, b]) {
    await db
      .update(matchmakingTicket)
      .set({ status: "matched", matchId, updatedAt })
      .where(eq(matchmakingTicket.id, t.id))
    await db.update(player).set({ status: "in_match", updatedAt }).where(eq(player.id, t.playerId))
  }

  // Notify both players in realtime.
  const [pa] = await db.select().from(player).where(eq(player.id, a.playerId)).limit(1)
  const [pb] = await db.select().from(player).where(eq(player.id, b.playerId)).limit(1)
  publish(a.userId, {
    type: "match_found",
    matchId,
    opponent: pb?.displayName ?? "Opponent",
    gameMode,
  })
  publish(b.userId, {
    type: "match_found",
    matchId,
    opponent: pa?.displayName ?? "Opponent",
    gameMode,
  })
}

/** Cancel a player's active searching ticket, if any. */
export async function leaveQueue(playerId: string) {
  const updatedAt = new Date()
  await db
    .update(matchmakingTicket)
    .set({ status: "cancelled", updatedAt })
    .where(and(eq(matchmakingTicket.playerId, playerId), eq(matchmakingTicket.status, "searching")))
  await db.update(player).set({ status: "online", updatedAt }).where(eq(player.id, playerId))
}
