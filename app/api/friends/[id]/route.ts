import { requirePlayer } from "@/lib/session"
import { ok, handle } from "@/lib/api"
import { respondToRequest, removeFriend } from "@/lib/services/friends"

// PATCH /api/friends/:id -> accept or decline a pending request
// body: { action: "accept" | "decline" }
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const me = await requirePlayer()
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const accept = body.action === "accept"
    const updated = await respondToRequest(me, id, accept)
    return ok(updated)
  })
}

// DELETE /api/friends/:id -> remove a friendship
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const me = await requirePlayer()
    const { id } = await params
    await removeFriend(me, id)
    return ok({ removed: true })
  })
}
