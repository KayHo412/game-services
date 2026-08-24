"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { api } from "@/lib/client"
import { CreatePlayer } from "@/components/dashboard/create-player"
import { useRealtime, RealtimeEvent } from "@/components/dashboard/use-realtime"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import {
  Swords,
  Users,
  Trophy,
  Activity,
  Terminal,
  LogOut,
  RefreshCw,
  Play,
  UserPlus,
  Check,
  X,
  Trash2,
  Zap,
} from "lucide-react"

type Player = {
  id: string
  userId: string
  username: string
  displayName: string
  rating: number
  wins: number
  losses: number
  draws: number
  gamesPlayed: number
  status: string
}

type QueueStatus = {
  inQueue: boolean
  ticketId?: string
  gameMode?: string
  waitingSeconds?: number
  currentTolerance?: number
}

type MatchPlayer = {
  id: string
  matchId: string
  playerId: string
  userId: string
  team: number
  ratingBefore: number
  ratingAfter: number | null
  ratingDelta: number | null
  outcome: string | null
}

type MatchDetail = {
  id: string
  gameMode: string
  status: string
  winnerPlayerId: string | null
  result: string | null
  createdAt: string
  completedAt: string | null
  players: MatchPlayer[]
}

type FriendItem = {
  id: string
  status: "pending" | "accepted" | "declined"
  direction: "incoming" | "outgoing"
  friend: {
    id: string
    username: string
    displayName: string
    rating: number
    status: string
  } | null
  createdAt: string
}

type LeaderboardEntry = Player & { rank: number }

export function Dashboard({
  user,
  initialPlayer,
}: {
  user: { name: string; email: string }
  initialPlayer: Player | null
}) {
  const router = useRouter()
  const [player, setPlayer] = useState<Player | null>(initialPlayer)

  // Dashboard states
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({ inQueue: false })
  const [gameMode, setGameMode] = useState<string>("ranked_1v1")
  const [matches, setMatches] = useState<MatchDetail[]>([])
  const [friends, setFriends] = useState<FriendItem[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])

  // Form states
  const [friendUsername, setFriendUsername] = useState("")
  const [loadingAction, setLoadingAction] = useState<string | null>(null)

  // API Tester states
  const [apiMethod, setApiMethod] = useState<string>("GET")
  const [apiPath, setApiPath] = useState<string>("/api/players")
  const [apiBody, setApiBody] = useState<string>("")
  const [apiResponse, setApiResponse] = useState<{ status?: number; data?: unknown; error?: string } | null>(null)

  // Fetch functions
  const refreshPlayer = useCallback(async () => {
    try {
      const p = await api<Player | null>("/api/players")
      setPlayer(p)
    } catch (err) {
      console.error("Failed to fetch player profile", err)
    }
  }, [])

  const refreshQueueStatus = useCallback(async () => {
    if (!player) return
    try {
      const q = await api<QueueStatus>("/api/matchmaking")
      setQueueStatus(q)
    } catch (err) {
      console.error("Failed to fetch queue status", err)
    }
  }, [player])

  const refreshMatches = useCallback(async () => {
    if (!player) return
    try {
      const m = await api<MatchDetail[]>("/api/matches")
      setMatches(m)
    } catch (err) {
      console.error("Failed to fetch matches", err)
    }
  }, [player])

  const refreshFriends = useCallback(async () => {
    if (!player) return
    try {
      const f = await api<FriendItem[]>("/api/friends")
      setFriends(f)
    } catch (err) {
      console.error("Failed to fetch friends", err)
    }
  }, [player])

  const refreshLeaderboard = useCallback(async () => {
    try {
      const lb = await api<LeaderboardEntry[]>("/api/leaderboard")
      setLeaderboard(lb)
    } catch (err) {
      console.error("Failed to fetch leaderboard", err)
    }
  }, [])

  const refreshAll = useCallback(() => {
    refreshPlayer()
    refreshQueueStatus()
    refreshMatches()
    refreshFriends()
    refreshLeaderboard()
  }, [refreshPlayer, refreshQueueStatus, refreshMatches, refreshFriends, refreshLeaderboard])

  // Realtime events connection
  const handleRealtimeEvent = useCallback(
    (e: RealtimeEvent) => {
      toast.info(`Realtime Event: ${e.event.type}`, {
        description: JSON.stringify(e.event),
      })
      refreshAll()
    },
    [refreshAll]
  )

  const { connected, log: eventLogs } = useRealtime(handleRealtimeEvent)

  const hasPlayer = !!player

  useEffect(() => {
    if (hasPlayer) {
      refreshAll()
    }
    // Only run this initial fetch when the player profile is first resolved or created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPlayer])

  // Periodic poll for queue timer update if in queue
  useEffect(() => {
    if (!queueStatus.inQueue) return
    const timer = setInterval(() => {
      refreshQueueStatus()
    }, 3000)
    return () => clearInterval(timer)
  }, [queueStatus.inQueue, refreshQueueStatus])

  if (!player) {
    return <CreatePlayer onCreated={setPlayer} />
  }

  // Action Handlers
  async function handleJoinQueue() {
    setLoadingAction("join_queue")
    try {
      await api("/api/matchmaking", { method: "POST", body: { gameMode } })
      toast.success(`Joined queue (${gameMode})`)
      refreshQueueStatus()
      refreshPlayer()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to join queue")
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleLeaveQueue() {
    setLoadingAction("leave_queue")
    try {
      await api("/api/matchmaking", { method: "DELETE" })
      toast.success("Left matchmaking queue")
      refreshQueueStatus()
      refreshPlayer()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to leave queue")
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleTriggerTick() {
    setLoadingAction("trigger_tick")
    try {
      const res = await api<{ scanned: number; matchesCreated: number; matchedTicketIds: string[] }>(
        "/api/matchmaking/tick",
        { method: "POST" }
      )
      toast.success(`Matchmaking tick executed! Matches created: ${res.matchesCreated}`)
      refreshAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to run matchmaking tick")
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleReportResult(matchId: string, winnerPlayerId: string | null) {
    setLoadingAction(`report_${matchId}`)
    try {
      await api(`/api/matches/${matchId}`, {
        method: "POST",
        body: { winnerPlayerId },
      })
      toast.success("Match result reported and Elo updated!")
      refreshAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to report match result")
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleSendFriendRequest(e: React.FormEvent) {
    e.preventDefault()
    if (!friendUsername.trim()) return
    setLoadingAction("send_friend")
    try {
      await api("/api/friends", {
        method: "POST",
        body: { username: friendUsername.trim() },
      })
      toast.success(`Friend request sent to @${friendUsername}`)
      setFriendUsername("")
      refreshFriends()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send friend request")
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleRespondFriend(id: string, action: "accept" | "decline") {
    setLoadingAction(`friend_${id}_${action}`)
    try {
      await api(`/api/friends/${id}`, {
        method: "PATCH",
        body: { action },
      })
      toast.success(`Friend request ${action}ed`)
      refreshFriends()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to respond to friend request")
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleRemoveFriend(id: string) {
    setLoadingAction(`friend_remove_${id}`)
    try {
      await api(`/api/friends/${id}`, { method: "DELETE" })
      toast.success("Friendship removed")
      refreshFriends()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove friend")
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleExecuteApiTest() {
    setLoadingAction("api_test")
    setApiResponse(null)
    try {
      let parsedBody: unknown = undefined
      if (apiBody.trim() && (apiMethod === "POST" || apiMethod === "PATCH" || apiMethod === "PUT")) {
        try {
          parsedBody = JSON.parse(apiBody)
        } catch {
          toast.error("Invalid JSON body")
          setLoadingAction(null)
          return
        }
      }

      const res = await fetch(apiPath, {
        method: apiMethod,
        headers: parsedBody ? { "Content-Type": "application/json" } : undefined,
        body: parsedBody ? JSON.stringify(parsedBody) : undefined,
      })

      const json = await res.json().catch(() => ({}))
      setApiResponse({
        status: res.status,
        data: json,
      })
      toast.success(`API Call Completed (${res.status})`)
    } catch (err) {
      setApiResponse({
        error: err instanceof Error ? err.message : "Request failed",
      })
      toast.error("API test request failed")
    } finally {
      setLoadingAction(null)
    }
  }

  async function handleSignOut() {
    await authClient.signOut()
    router.push("/sign-in")
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-background px-4 py-6 text-foreground md:px-8 md:py-10 font-sans">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* Header Bar */}
        <header className="flex flex-col items-start justify-between gap-4 rounded-lg border bg-card p-5 sm:flex-row sm:items-center">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{player.displayName}</h1>
              <Badge variant="outline" className="font-mono text-[11px]">
                @{player.username}
              </Badge>
              <Badge
                variant="secondary"
                className={
                  player.status === "in_match"
                    ? "text-foreground"
                    : player.status === "in_queue"
                    ? "text-foreground"
                    : "text-muted-foreground"
                }
              >
                ● {player.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">User: {user.name} ({user.email})</p>
          </div>

          {/* Player Quick Stats */}
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="font-mono text-2xl font-semibold text-foreground">{player.rating}</div>
              <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Elo Rating</div>
            </div>
            <Separator orientation="vertical" className="h-8 bg-border" />
            <div className="text-center">
              <div className="text-sm font-medium text-foreground">
                <span>{player.wins}W</span> / <span>{player.losses}L</span> / <span>{player.draws}D</span>
              </div>
              <div className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {player.gamesPlayed} Played
              </div>
            </div>
            <Separator orientation="vertical" className="h-8 bg-border" />
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={refreshAll}
                title="Refresh All Data"
                className="text-muted-foreground"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                className="bg-background"
              >
                <LogOut className="w-4 h-4 mr-2" /> Sign Out
              </Button>
            </div>
          </div>
        </header>

        {/* Realtime Stream Bar */}
        <div className="flex items-center justify-between rounded-md border bg-card px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                connected ? "bg-foreground/70" : "bg-muted-foreground/70"
              }`}
            />
            <span className="font-medium text-foreground">
              Realtime Event Stream (/api/events): {connected ? "Connected" : "Disconnected"}
            </span>
          </div>
          <span className="text-muted-foreground">Listening for SSE live events...</span>
        </div>

        {/* Main Workspace Tabs */}
        <Tabs defaultValue="matchmaking" className="space-y-6">
          <TabsList className="border bg-card p-1">
            <TabsTrigger value="matchmaking">
              <Swords className="w-4 h-4 mr-2" /> Matchmaking & Matches
            </TabsTrigger>
            <TabsTrigger value="friends">
              <Users className="w-4 h-4 mr-2" /> Friends ({friends.filter(f => f.status === 'pending' && f.direction === 'incoming').length})
            </TabsTrigger>
            <TabsTrigger value="leaderboard">
              <Trophy className="w-4 h-4 mr-2" /> Leaderboard
            </TabsTrigger>
            <TabsTrigger value="events">
              <Activity className="w-4 h-4 mr-2" /> Live SSE Logs ({eventLogs.length})
            </TabsTrigger>
            <TabsTrigger value="tester">
              <Terminal className="w-4 h-4 mr-2" /> API Tester
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Matchmaking & Matches */}
          <TabsContent value="matchmaking" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Matchmaking Queue Controls */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Matchmaking Queue</span>
                    {queueStatus.inQueue ? (
                      <Badge variant="secondary" className="text-foreground">
                        Searching...
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Idle
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>Join the 1v1 queue or execute a worker tick to test pairings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {queueStatus.inQueue ? (
                    <div className="space-y-4 rounded-md border bg-muted/30 p-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Game Mode:</span>
                        <span className="font-mono font-medium text-foreground">{queueStatus.gameMode}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Wait Time:</span>
                        <span className="font-mono text-foreground">{queueStatus.waitingSeconds}s</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Rating Range:</span>
                        <span className="font-mono text-foreground">±{queueStatus.currentTolerance}</span>
                      </div>

                      <Button
                        onClick={handleLeaveQueue}
                        disabled={loadingAction === "leave_queue"}
                        variant="destructive"
                        className="w-full"
                      >
                        <X className="w-4 h-4 mr-2" /> Leave Queue
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">Select Game Mode</label>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            variant={gameMode === "ranked_1v1" ? "default" : "outline"}
                            onClick={() => setGameMode("ranked_1v1")}
                            className={gameMode === "ranked_1v1" ? "" : ""}
                          >
                            Ranked 1v1
                          </Button>
                          <Button
                            type="button"
                            variant={gameMode === "casual_1v1" ? "default" : "outline"}
                            onClick={() => setGameMode("casual_1v1")}
                            className={gameMode === "casual_1v1" ? "" : ""}
                          >
                            Casual 1v1
                          </Button>
                        </div>
                      </div>

                      <Button
                        onClick={handleJoinQueue}
                        disabled={loadingAction === "join_queue"}
                        className="w-full"
                      >
                        <Play className="w-4 h-4 mr-2" /> Join Queue (POST /api/matchmaking)
                      </Button>
                    </div>
                  )}

                  <Separator className="bg-border" />

                  {/* Manual Worker Tick Button */}
                  <div className="space-y-2 rounded-md border bg-muted/30 p-4">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-xs font-semibold text-foreground">
                        <Zap className="w-3.5 h-3.5" /> Worker Simulator
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">POST /api/matchmaking/tick</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Instantly triggers the matchmaking pairing pass (normally run on cron). Pairs compatible players in queue into active matches.
                    </p>
                    <Button
                      onClick={handleTriggerTick}
                      disabled={loadingAction === "trigger_tick"}
                      variant="outline"
                      className="w-full"
                    >
                      <Play className="w-4 h-4 mr-2" /> Run Matchmaking Tick Now
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Match History & Active Match Reporting */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Recent & Active Matches</span>
                    <Button variant="ghost" size="sm" onClick={refreshMatches} className="text-muted-foreground">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                  </CardTitle>
                  <CardDescription>View matches and report outcomes to test Elo calculation engine</CardDescription>
                </CardHeader>
                <CardContent className="max-h-125 space-y-4 overflow-y-auto pr-1">
                  {matches.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      No matches found. Join queue with 2 users (or multiple browser tabs) and trigger a tick!
                    </div>
                  ) : (
                    matches.map((m) => {
                      const meParticipant = m.players.find((p) => p.playerId === player.id)
                      const opponentParticipant = m.players.find((p) => p.playerId !== player.id)

                      return (
                        <div
                          key={m.id}
                          className="space-y-3 rounded-md border bg-muted/25 p-4"
                        >
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-mono text-muted-foreground">{m.id}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="font-mono text-muted-foreground">
                                {m.gameMode}
                              </Badge>
                              <Badge
                                className={
                                  m.status === "active"
                                    ? "text-foreground"
                                    : "text-muted-foreground"
                                }
                              >
                                {m.status}
                              </Badge>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-sm py-1">
                            <div className="font-semibold text-foreground">
                              You ({meParticipant?.ratingBefore} Elo)
                            </div>
                            <span className="text-xs font-bold text-muted-foreground">VS</span>
                            <div className="font-semibold text-foreground">
                              Opponent ({opponentParticipant?.ratingBefore ?? "???"} Elo)
                            </div>
                          </div>

                          {m.status === "active" ? (
                            <div className="space-y-2 border-t pt-2">
                              <span className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
                                Report Outcome (POST /api/matches/:id)
                              </span>
                              <div className="grid grid-cols-3 gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleReportResult(m.id, player.id)}
                                  disabled={loadingAction === `report_${m.id}`}
                                  className="text-xs"
                                >
                                  Report Win
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleReportResult(m.id, opponentParticipant?.playerId ?? null)}
                                  disabled={loadingAction === `report_${m.id}`}
                                  variant="outline"
                                  className="text-xs"
                                >
                                  Report Loss
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleReportResult(m.id, null)}
                                  disabled={loadingAction === `report_${m.id}`}
                                  variant="secondary"
                                  className="text-xs"
                                >
                                  Report Draw
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between border-t pt-2 text-xs">
                              <span className="text-muted-foreground">
                                Result:{" "}
                                <span className="font-bold uppercase text-foreground">{m.result ?? "completed"}</span>
                              </span>
                              {meParticipant?.ratingDelta !== null && meParticipant?.ratingDelta !== undefined && (
                                <span
                                  className={`font-mono font-bold ${
                                    meParticipant.ratingDelta >= 0 ? "text-foreground" : "text-muted-foreground"
                                  }`}
                                >
                                  {meParticipant.ratingDelta >= 0 ? `+${meParticipant.ratingDelta}` : meParticipant.ratingDelta} Elo
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </CardContent>
              </Card>

            </div>
          </TabsContent>

          {/* TAB 2: Friends Management */}
          <TabsContent value="friends" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Send Request Card */}
              <Card>
                <CardHeader>
                  <CardTitle>Send Friend Request</CardTitle>
                  <CardDescription>Enter another player&apos;s username to send a request (POST /api/friends)</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSendFriendRequest} className="flex gap-2">
                    <Input
                      placeholder="Username (e.g. player_two)"
                      value={friendUsername}
                      onChange={(e) => setFriendUsername(e.target.value)}
                      className="bg-background"
                    />
                    <Button
                      type="submit"
                      disabled={loadingAction === "send_friend" || !friendUsername.trim()}
                    >
                      <UserPlus className="w-4 h-4 mr-2" /> Send
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Friends List */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Friendships & Requests</span>
                    <Button variant="ghost" size="sm" onClick={refreshFriends} className="text-muted-foreground">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                  </CardTitle>
                  <CardDescription>Manage incoming requests, accepted friends, and outgoing pending requests</CardDescription>
                </CardHeader>
                <CardContent className="max-h-125 space-y-3 overflow-y-auto">
                  {friends.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      No friendships found. Send a request to another registered player!
                    </div>
                  ) : (
                    friends.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between rounded-md border bg-muted/25 p-3 text-sm"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground">
                              {f.friend?.displayName ?? "Unknown Player"}
                            </span>
                            <span className="text-xs text-muted-foreground">(@{f.friend?.username})</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <Badge variant="outline" className="py-0 text-xs text-muted-foreground">
                              {f.status}
                            </Badge>
                            <span className="text-muted-foreground">{f.direction}</span>
                            {f.friend?.rating && (
                              <span className="font-mono text-[11px] text-foreground">{f.friend.rating} Elo</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          {f.status === "pending" && f.direction === "incoming" && (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleRespondFriend(f.id, "accept")}
                                disabled={loadingAction === `friend_${f.id}_accept`}
                                className="h-8 px-2.5"
                              >
                                <Check className="w-3.5 h-3.5 mr-1" /> Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRespondFriend(f.id, "decline")}
                                disabled={loadingAction === `friend_${f.id}_decline`}
                                className="h-8 px-2.5"
                              >
                                <X className="w-3.5 h-3.5 mr-1" /> Decline
                              </Button>
                            </>
                          )}

                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleRemoveFriend(f.id)}
                            disabled={loadingAction === `friend_remove_${f.id}`}
                            className="h-8 w-8 text-muted-foreground"
                            title="Delete Friendship"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

            </div>
          </TabsContent>

          {/* TAB 3: Leaderboard */}
          <TabsContent value="leaderboard">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Public Elo Leaderboard</span>
                  <Button variant="ghost" size="sm" onClick={refreshLeaderboard} className="text-muted-foreground">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                </CardTitle>
                <CardDescription>Top ranked players sorted by Elo rating (GET /api/leaderboard)</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-16 text-muted-foreground">Rank</TableHead>
                      <TableHead className="text-muted-foreground">Player</TableHead>
                      <TableHead className="text-right text-muted-foreground">Rating</TableHead>
                      <TableHead className="text-right text-muted-foreground">Record (W/L/D)</TableHead>
                      <TableHead className="text-right text-muted-foreground">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaderboard.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-muted-foreground">
                          No players on leaderboard yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      leaderboard.map((lb) => (
                        <TableRow
                          key={lb.id}
                          className={`hover:bg-muted/30 ${
                            lb.id === player.id ? "bg-muted/35" : ""
                          }`}
                        >
                          <TableCell className="font-mono font-bold text-foreground">#{lb.rank}</TableCell>
                          <TableCell>
                            <div>
                              <span className="font-semibold text-foreground">{lb.displayName}</span>
                              <span className="ml-2 text-xs text-muted-foreground">@{lb.username}</span>
                              {lb.id === player.id && (
                                <Badge variant="outline" className="ml-2 text-[10px]">You</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-foreground">
                            {lb.rating}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono text-foreground">
                            <span>{lb.wins}W</span> - <span>{lb.losses}L</span> - <span>{lb.draws}D</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline" className="text-xs text-muted-foreground">
                              {lb.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 4: Live SSE Logs */}
          <TabsContent value="events">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Server-Sent Events (SSE) Live Feed</span>
                  <Badge variant="outline" className="font-mono text-muted-foreground">
                    Live Channel: user:{player.userId}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Streaming realtime events emitted by backend services (`publish(userId, event)`)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-112.5 space-y-2 overflow-y-auto rounded-md border bg-muted/25 p-4 font-mono text-xs">
                  {eventLogs.length === 0 ? (
                    <div className="py-6 text-center text-muted-foreground">
                      No events received yet. Perform matchmaking or friend actions to trigger realtime events!
                    </div>
                  ) : (
                    eventLogs.map((log, idx) => (
                      <div key={idx} className="border-b border-border pb-2 text-foreground">
                        <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                          <span className="font-bold text-foreground">[{log.event.type}]</span>
                          <span>{new Date(log.at).toLocaleTimeString()}</span>
                        </div>
                        <pre className="whitespace-pre-wrap rounded-sm bg-background p-2 text-muted-foreground">
                          {JSON.stringify(log.event, null, 2)}
                        </pre>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 5: API Tester */}
          <TabsContent value="tester">
            <Card>
              <CardHeader>
                <CardTitle>Raw API Endpoint Tester</CardTitle>
                <CardDescription>
                  Manually invoke any backend API route directly from the frontend to inspect response data & HTTP status
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">

                {/* Method & Path Selector */}
                <div className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={apiMethod}
                    onChange={(e) => setApiMethod(e.target.value)}
                    className="rounded-md border bg-background px-3 py-2 text-sm font-mono text-foreground"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PATCH">PATCH</option>
                    <option value="DELETE">DELETE</option>
                  </select>

                  <Input
                    value={apiPath}
                    onChange={(e) => setApiPath(e.target.value)}
                    placeholder="/api/players"
                    className="bg-background font-mono text-sm"
                  />

                  <Button
                    onClick={handleExecuteApiTest}
                    disabled={loadingAction === "api_test"}
                    className="shrink-0"
                  >
                    <Play className="w-4 h-4 mr-2" /> Execute
                  </Button>
                </div>

                {/* Body Input for POST/PATCH */}
                {(apiMethod === "POST" || apiMethod === "PATCH") && (
                  <div className="space-y-1">
                    <label className="text-xs font-mono text-muted-foreground">JSON Body Payload:</label>
                    <textarea
                      value={apiBody}
                      onChange={(e) => setApiBody(e.target.value)}
                      placeholder='{"username": "test_player"}'
                      rows={3}
                      className="w-full rounded-md border bg-background p-3 font-mono text-xs text-foreground"
                    />
                  </div>
                )}

                {/* Quick Preset Buttons */}
                <div className="space-y-2">
                  <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    Quick Preset Requests:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => {
                        setApiMethod("GET")
                        setApiPath("/api/players")
                      }}
                    >
                      GET /api/players
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => {
                        setApiMethod("GET")
                        setApiPath("/api/matchmaking")
                      }}
                    >
                      GET /api/matchmaking
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => {
                        setApiMethod("POST")
                        setApiPath("/api/matchmaking/tick")
                        setApiBody("")
                      }}
                    >
                      POST /api/matchmaking/tick
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => {
                        setApiMethod("GET")
                        setApiPath("/api/matches")
                      }}
                    >
                      GET /api/matches
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => {
                        setApiMethod("GET")
                        setApiPath("/api/friends")
                      }}
                    >
                      GET /api/friends
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() => {
                        setApiMethod("GET")
                        setApiPath("/api/leaderboard")
                      }}
                    >
                      GET /api/leaderboard
                    </Button>
                  </div>
                </div>

                {/* Output Inspector */}
                {apiResponse && (
                  <div className="space-y-2 border-t pt-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground">API Response Output:</span>
                      {apiResponse.status && (
                        <Badge
                          className={
                            apiResponse.status < 400
                              ? "text-foreground"
                              : "text-destructive"
                          }
                        >
                          Status: {apiResponse.status}
                        </Badge>
                      )}
                    </div>
                    <pre className="max-h-87.5 overflow-x-auto rounded-md border bg-muted/25 p-4 font-mono text-xs text-foreground">
                      {JSON.stringify(apiResponse.data ?? apiResponse.error, null, 2)}
                    </pre>
                  </div>
                )}

              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>

      </div>
    </div>
  )
}
