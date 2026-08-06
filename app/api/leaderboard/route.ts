import { db } from "@/lib/db"
import { player } from "@/lib/db/schema"
import { desc } from "drizzle-orm"
import { ok, handle } from "@/lib/api"

// GET /api/leaderboard?limit=20 -> top players by rating (public)
export async function GET(req: Request) {
  return handle(async () => {
    const url = new URL(req.url)
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? 20)))
    const rows = await db.select().from(player).orderBy(desc(player.rating)).limit(limit)
    const ranked = rows.map((p, i) => ({ rank: i + 1, ...p }))
    return ok(ranked)
  })
}
