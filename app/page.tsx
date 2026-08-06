import { auth } from "@/lib/auth"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getPlayerByUserId } from "@/lib/session"
import { Dashboard } from "@/components/dashboard/dashboard"

export default async function HomePage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect("/sign-in")

  const player = await getPlayerByUserId(session.user.id)

  return (
    <Dashboard
      user={{ name: session.user.name, email: session.user.email }}
      initialPlayer={player}
    />
  )
}
