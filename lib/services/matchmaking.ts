import { db } from "@/lib/db"
import { matchmakingTicket, match, matchPlayer, player } from "@/lib/db/schema"
import { and, asc, eq, sql } from "drizzle-orm"
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
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('game-services:matchmaking-tick'))`)

    const searching = await tx
      .select()
      .from(matchmakingTicket)
      .where(eq(matchmakingTicket.status, "searching"))
      .for("update")
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
    const notifications: Array<{ userId: string; event: Parameters<typeof publish>[1] }> = []

    for (const [gameMode, tickets] of byMode) {
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
            notifications.push(...(await createMatch(tx, gameMode, a, b)))
            used.add(a.id)
            used.add(b.id)
            matchedTicketIds.push(a.id, b.id)
            matchesCreated++
            break
          }
        }
      }
    }

    return { result: { scanned: searching.length, matchesCreated, matchedTicketIds }, notifications }
  })

  for (const notification of result.notifications) publish(notification.userId, notification.event)
  return result.result
}

async function createMatch(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  gameMode: string,
  a: typeof matchmakingTicket.$inferSelect,
  b: typeof matchmakingTicket.$inferSelect,
): Promise<Array<{ userId: string; event: Parameters<typeof publish>[1] }>> {
  const matchId = id("match")

  await tx.insert(match).values({
    id: matchId,
    gameMode,
    status: "active",
  })

  await tx.insert(matchPlayer).values([
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
    await tx
      .update(matchmakingTicket)
      .set({ status: "matched", matchId, updatedAt })
      .where(and(eq(matchmakingTicket.id, t.id), eq(matchmakingTicket.status, "searching")))
    await tx
      .update(player)
      .set({ status: "in_match", updatedAt })
      .where(and(eq(player.id, t.playerId), eq(player.status, "in_queue")))
  }

  const [pa] = await tx.select().from(player).where(eq(player.id, a.playerId)).limit(1)
  const [pb] = await tx.select().from(player).where(eq(player.id, b.playerId)).limit(1)
  return [
    { userId: a.userId, event: { type: "match_found", matchId, opponent: pb?.displayName ?? "Opponent", gameMode } },
    { userId: b.userId, event: { type: "match_found", matchId, opponent: pa?.displayName ?? "Opponent", gameMode } },
  ]
}

/** Cancel a player's active searching ticket, if any. */
export async function leaveQueue(playerId: string) {
  await db.transaction(async (tx) => {
    const updatedAt = new Date()
    const [cancelled] = await tx
      .update(matchmakingTicket)
      .set({ status: "cancelled", updatedAt })
      .where(and(eq(matchmakingTicket.playerId, playerId), eq(matchmakingTicket.status, "searching")))
      .returning()
    if (cancelled) {
      await tx
        .update(player)
        .set({ status: "online", updatedAt })
        .where(and(eq(player.id, playerId), eq(player.status, "in_queue")))
    }
  })
}
