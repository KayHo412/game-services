import { requirePlayer, HttpError } from "@/lib/session"
import { ok, handle } from "@/lib/api"
import { listFriends, sendRequest } from "@/lib/services/friends"

// GET /api/friends -> list friendships for the authenticated player
export async function GET() {
  return handle(async () => {
    const me = await requirePlayer()
    return ok(await listFriends(me.id))
  })
}

// POST /api/friends -> send a friend request by username
// body: { username: string }
export async function POST(req: Request) {
  return handle(async () => {
    const me = await requirePlayer()
    const body = await req.json().catch(() => ({}))
    const username = String(body.username ?? "").trim()
    if (!username) throw new HttpError(400, "username is required")
    const created = await sendRequest(me, username)
    return ok(created, 201)
  })
}
