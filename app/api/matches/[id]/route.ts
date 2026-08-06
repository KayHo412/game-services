import { requirePlayer, HttpError } from "@/lib/session"
import { ok, handle } from "@/lib/api"
import { getMatchWithPlayers, reportResult } from "@/lib/services/matches"

// GET /api/matches/:id -> match detail (must be a participant)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const me = await requirePlayer()
    const { id } = await params
    const m = await getMatchWithPlayers(id)
    if (!m) throw new HttpError(404, "Match not found")
    if (!m.players.some((p) => p.playerId === me.id)) {
      throw new HttpError(403, "Not a participant of this match")
    }
    return ok(m)
  })
}

// POST /api/matches/:id -> report the result
// body: { winnerPlayerId: string | null }  (null = draw)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const me = await requirePlayer()
    const { id } = await params
    const m = await getMatchWithPlayers(id)
    if (!m) throw new HttpError(404, "Match not found")
    if (!m.players.some((p) => p.playerId === me.id)) {
      throw new HttpError(403, "Not a participant of this match")
    }

    const body = await req.json().catch(() => ({}))
    const winnerPlayerId =
      body.winnerPlayerId === null || body.winnerPlayerId === undefined
        ? null
        : String(body.winnerPlayerId)

    const updated = await reportResult(id, winnerPlayerId)
    return ok(updated)
  })
}
