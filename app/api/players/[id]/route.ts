import { db } from "@/lib/db"
import { player } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { requireUserId, HttpError } from "@/lib/session"
import { ok, handle } from "@/lib/api"

// GET /api/players/:id -> public profile of any player
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireUserId()
    const { id } = await params
    const [row] = await db.select().from(player).where(eq(player.id, id)).limit(1)
    if (!row) throw new HttpError(404, "Player not found")
    return ok(row)
  })
}
