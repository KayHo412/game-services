import { runMatchmakingTick } from "@/lib/services/matchmaking"
import { ok, fail, handle } from "@/lib/api"

/**
 * POST /api/matchmaking/tick
 *
 * The matchmaking "worker". Runs one pairing pass over the queue. Intended to
 * be invoked on a schedule (Vercel Cron, an external worker, or the dashboard's
 * poller). Protected by an optional WORKER_SECRET bearer token when set.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const secret = process.env.WORKER_SECRET
    if (secret) {
      const auth = req.headers.get("authorization")
      if (auth !== `Bearer ${secret}`) return fail(401, "Invalid worker secret")
    }
    const result = await runMatchmakingTick()
    return ok(result)
  })
}

// Allow GET for easy cron pings (no secret required only if unset).
export async function GET(req: Request) {
  return POST(req)
}
