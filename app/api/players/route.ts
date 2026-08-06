import { db } from "@/lib/db"
import { player } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { requireUserId, getPlayerByUserId, HttpError } from "@/lib/session"
import { ok, fail, handle, id } from "@/lib/api"
import { DEFAULT_RATING } from "@/lib/elo"

// GET /api/players -> the authenticated user's own profile (or null)
export async function GET() {
  return handle(async () => {
    const userId = await requireUserId()
    const me = await getPlayerByUserId(userId)
    return ok(me)
  })
}

// POST /api/players -> create the authenticated user's player profile
export async function POST(req: Request) {
  return handle(async () => {
    const userId = await requireUserId()
    const body = await req.json().catch(() => ({}))
    const username = String(body.username ?? "").trim()
    const displayName = String(body.displayName ?? username).trim()

    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      throw new HttpError(400, "username must be 3-20 chars: letters, numbers, underscore")
    }

    const existing = await getPlayerByUserId(userId)
    if (existing) throw new HttpError(409, "Player profile already exists")

    const dupe = await db.select().from(player).where(eq(player.username, username)).limit(1)
    if (dupe.length) throw new HttpError(409, "username already taken")

    const [created] = await db
      .insert(player)
      .values({
        id: id("player"),
        userId,
        username,
        displayName: displayName || username,
        rating: DEFAULT_RATING,
        status: "online",
      })
      .returning()

    return ok(created, 201)
  })
}

export { fail }
