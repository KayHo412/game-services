import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { player } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { headers } from "next/headers"

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Returns the authenticated user id or throws a 401 HttpError. */
export async function requireUserId(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) throw new HttpError(401, "Unauthorized")
  return session.user.id
}

/** Returns the authenticated user's player profile or throws. */
export async function requirePlayer() {
  const userId = await requireUserId()
  const [row] = await db.select().from(player).where(eq(player.userId, userId)).limit(1)
  if (!row) throw new HttpError(404, "No player profile. Create one first.")
  return row
}

/** Returns the player profile for a user id, or null. */
export async function getPlayerByUserId(userId: string) {
  const [row] = await db.select().from(player).where(eq(player.userId, userId)).limit(1)
  return row ?? null
}
