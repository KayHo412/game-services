"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { api } from "@/lib/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"

export function CreatePlayer({ onCreated }: { onCreated?: (player: any) => void }) {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const created = await api("/api/players", { method: "POST", body: { username, displayName } })
      toast.success("Player profile created")
      if (onCreated) {
        onCreated(created)
      } else {
        router.refresh()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create player")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-svh flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your player profile</CardTitle>
          <CardDescription>
            Pick a username to enter the arena. You start at 1200 Elo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="shadow_striker"
                required
              />
              <p className="text-xs text-muted-foreground">3-20 chars: letters, numbers, underscore</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Shadow Striker"
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Enter the arena"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
