import { requirePlayer } from "@/lib/session"
import { ok, handle } from "@/lib/api"
import { listMatchesForPlayer } from "@/lib/services/matches"

// GET /api/matches -> the authenticated player's recent matches
export async function GET(req: Request) {
  return handle(async () => {
    const me = await requirePlayer()
    const url = new URL(req.url)
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20)))
    const matches = await listMatchesForPlayer(me.id, limit)
    return ok(matches)
  })
}
