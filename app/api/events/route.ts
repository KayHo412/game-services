import { requireUserId } from "@/lib/session"
import { subscribe } from "@/lib/events"

export const dynamic = "force-dynamic"

/**
 * GET /api/events
 *
 * Server-Sent Events stream of realtime notifications for the authenticated
 * user (match found, match completed, friend requests, etc.).
 */
export async function GET(req: Request) {
  let userId: string
  try {
    userId = await requireUserId()
  } catch {
    return new Response("Unauthorized", { status: 401 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      // initial hello + subscribe
      send({ event: { type: "presence", status: "connected" }, at: new Date().toISOString() })
      const unsubscribe = subscribe(userId, (env) => send(env))

      // heartbeat to keep the connection alive through proxies
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`))
      }, 15000)

      const close = () => {
        clearInterval(heartbeat)
        unsubscribe()
        try {
          controller.close()
        } catch {
          // already closed
        }
      }

      req.signal.addEventListener("abort", close)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
