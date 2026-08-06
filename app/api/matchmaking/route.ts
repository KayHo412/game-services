import { db } from "@/lib/db"
import { matchmakingTicket, player } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"
import { requirePlayer, HttpError } from "@/lib/session"
import { ok, handle, id } from "@/lib/api"
import { leaveQueue, ratingTolerance } from "@/lib/services/matchmaking"

const MODES = ["ranked_1v1", "casual_1v1"]

// GET /api/matchmaking -> current queue status for the authenticated player
export async function GET() {
  return handle(async () => {
    const me = await requirePlayer()
    const [ticket] = await db
      .select()
      .from(matchmakingTicket)
      .where(and(eq(matchmakingTicket.playerId, me.id), eq(matchmakingTicket.status, "searching")))
      .limit(1)

    if (!ticket) return ok({ inQueue: false })

    const waitingMs = Date.now() - new Date(ticket.enqueuedAt).getTime()
    return ok({
      inQueue: true,
      ticketId: ticket.id,
      gameMode: ticket.gameMode,
      waitingSeconds: Math.floor(waitingMs / 1000),
      currentTolerance: ratingTolerance(new Date(ticket.enqueuedAt)),
    })
  })
}

// POST /api/matchmaking -> join the queue
export async function POST(req: Request) {
  return handle(async () => {
    const me = await requirePlayer()
    const body = await req.json().catch(() => ({}))
    const gameMode = String(body.gameMode ?? "ranked_1v1")
    if (!MODES.includes(gameMode)) throw new HttpError(400, `gameMode must be one of ${MODES.join(", ")}`)

    const existing = await db
      .select()
      .from(matchmakingTicket)
      .where(and(eq(matchmakingTicket.playerId, me.id), eq(matchmakingTicket.status, "searching")))
      .limit(1)
    if (existing.length) throw new HttpError(409, "Already in queue")

    const [ticket] = await db
      .insert(matchmakingTicket)
      .values({
        id: id("ticket"),
        playerId: me.id,
        userId: me.userId,
        gameMode,
        rating: me.rating,
        status: "searching",
      })
      .returning()

    await db.update(player).set({ status: "in_queue", updatedAt: new Date() }).where(eq(player.id, me.id))

    return ok(ticket, 201)
  })
}

// DELETE /api/matchmaking -> leave the queue
export async function DELETE() {
  return handle(async () => {
    const me = await requirePlayer()
    await leaveQueue(me.id)
    return ok({ left: true })
  })
}
