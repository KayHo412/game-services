import { db } from "@/lib/db"
import { match, matchPlayer, player } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { computeElo } from "@/lib/elo"
import { HttpError } from "@/lib/session"
import { publish } from "@/lib/events"

export async function getMatchWithPlayers(matchId: string) {
  const [m] = await db.select().from(match).where(eq(match.id, matchId)).limit(1)
  if (!m) return null
  const participants = await db.select().from(matchPlayer).where(eq(matchPlayer.matchId, matchId))
  return { ...m, players: participants }
}

/**
 * Report the result of a 1v1 match. `outcome` is from the reporting caller's
 * perspective is irrelevant — we take an explicit winnerPlayerId (or null for
 * a draw). Applies Elo updates, updates W/L/D records, and closes the match.
 */
export async function reportResult(matchId: string, winnerPlayerId: string | null) {
  const result = await db.transaction(async (tx) => {
    const [m] = await tx.select().from(match).where(eq(match.id, matchId)).for("update").limit(1)
    if (!m) throw new HttpError(404, "Match not found")
    if (m.status !== "active") throw new HttpError(409, "Match already completed")

    const participants = await tx
      .select()
      .from(matchPlayer)
      .where(eq(matchPlayer.matchId, matchId))
      .for("update")
    if (participants.length !== 2) throw new HttpError(400, "Only 1v1 matches are supported")

    const [a, b] = participants
    if (winnerPlayerId && winnerPlayerId !== a.playerId && winnerPlayerId !== b.playerId) {
      throw new HttpError(400, "winnerPlayerId is not part of this match")
    }

    const playerIds = [a.playerId, b.playerId].sort()
    const lockedPlayers = new Map<string, typeof player.$inferSelect>()
    for (const playerId of playerIds) {
      const [row] = await tx.select().from(player).where(eq(player.id, playerId)).for("update").limit(1)
      if (!row) throw new HttpError(404, "Player profile missing")
      lockedPlayers.set(row.id, row)
    }

    const pa = lockedPlayers.get(a.playerId)!
    const pb = lockedPlayers.get(b.playerId)!
    const scoreA: 0 | 0.5 | 1 = winnerPlayerId === null ? 0.5 : winnerPlayerId === a.playerId ? 1 : 0
    const elo = computeElo(pa.rating, pb.rating, scoreA, pa.gamesPlayed, pb.gamesPlayed)
    const now = new Date()
    const outcomeA = scoreA === 1 ? "win" : scoreA === 0 ? "loss" : "draw"
    const outcomeB = scoreA === 1 ? "loss" : scoreA === 0 ? "win" : "draw"

    await tx
      .update(matchPlayer)
      .set({ ratingAfter: elo.ratingA, ratingDelta: elo.deltaA, outcome: outcomeA })
      .where(eq(matchPlayer.id, a.id))
    await tx
      .update(matchPlayer)
      .set({ ratingAfter: elo.ratingB, ratingDelta: elo.deltaB, outcome: outcomeB })
      .where(eq(matchPlayer.id, b.id))

    await tx
      .update(player)
      .set({
        rating: elo.ratingA,
        gamesPlayed: pa.gamesPlayed + 1,
        wins: pa.wins + (outcomeA === "win" ? 1 : 0),
        losses: pa.losses + (outcomeA === "loss" ? 1 : 0),
        draws: pa.draws + (outcomeA === "draw" ? 1 : 0),
        status: "online",
        updatedAt: now,
      })
      .where(eq(player.id, pa.id))
    await tx
      .update(player)
      .set({
        rating: elo.ratingB,
        gamesPlayed: pb.gamesPlayed + 1,
        wins: pb.wins + (outcomeB === "win" ? 1 : 0),
        losses: pb.losses + (outcomeB === "loss" ? 1 : 0),
        draws: pb.draws + (outcomeB === "draw" ? 1 : 0),
        status: "online",
        updatedAt: now,
      })
      .where(eq(player.id, pb.id))

    await tx
      .update(match)
      .set({
        status: "completed",
        winnerPlayerId,
        result: winnerPlayerId === null ? "draw" : "win",
        completedAt: now,
      })
      .where(and(eq(match.id, matchId), eq(match.status, "active")))

    return {
      notifications: [
        { userId: a.userId, event: { type: "match_completed" as const, matchId, result: outcomeA, ratingDelta: elo.deltaA } },
        { userId: b.userId, event: { type: "match_completed" as const, matchId, result: outcomeB, ratingDelta: elo.deltaB } },
      ],
    }
  })

  for (const notification of result.notifications) publish(notification.userId, notification.event)
  return getMatchWithPlayers(matchId)
}

export async function listMatchesForPlayer(playerId: string, limit = 20) {
  const rows = await db
    .select()
    .from(matchPlayer)
    .where(eq(matchPlayer.playerId, playerId))
    .limit(limit)

  const result = []
  for (const mp of rows) {
    const full = await getMatchWithPlayers(mp.matchId)
    if (full) result.push(full)
  }
  // newest first
  result.sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime())
  return result
}

export { and, eq }
