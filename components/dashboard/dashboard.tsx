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
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Bar */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-lg">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white">{player.displayName}</h1>
              <Badge variant="outline" className="border-indigo-500 text-indigo-400 font-mono">
                @{player.username}
              </Badge>
              <Badge
                variant="secondary"
                className={
                  player.status === "in_match"
                    ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                    : player.status === "in_queue"
                    ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                    : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                }
              >
                ● {player.status}
              </Badge>
            </div>
            <p className="text-xs text-slate-400">User: {user.name} ({user.email})</p>
          </div>

          {/* Player Quick Stats */}
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-2xl font-black text-amber-400 font-mono">{player.rating}</div>
              <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Elo Rating</div>
            </div>
            <Separator orientation="vertical" className="h-8 bg-slate-800" />
            <div className="text-center">
              <div className="text-sm font-semibold text-slate-200">
                <span className="text-emerald-400">{player.wins}W</span> /{" "}
                <span className="text-rose-400">{player.losses}L</span> /{" "}
                <span className="text-amber-300">{player.draws}D</span>
              </div>
              <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                {player.gamesPlayed} Played
              </div>
            </div>
            <Separator orientation="vertical" className="h-8 bg-slate-800" />
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={refreshAll}
                title="Refresh All Data"
                className="text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                className="border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800"
              >
                <LogOut className="w-4 h-4 mr-2" /> Sign Out
              </Button>
            </div>
          </div>
        </header>

        {/* Realtime Stream Bar */}
        <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 px-4 py-2.5 rounded-lg text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
              }`}
            />
            <span className="text-slate-300 font-medium">
              Realtime Event Stream (/api/events): {connected ? "Connected" : "Disconnected"}
            </span>
          </div>
          <span className="text-slate-500">Listening for SSE live events...</span>
        </div>

        {/* Main Workspace Tabs */}
        <Tabs defaultValue="matchmaking" className="space-y-6">
          <TabsList className="bg-slate-900 border border-slate-800 p-1">
            <TabsTrigger value="matchmaking" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              <Swords className="w-4 h-4 mr-2" /> Matchmaking & Matches
            </TabsTrigger>
            <TabsTrigger value="friends" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              <Users className="w-4 h-4 mr-2" /> Friends ({friends.filter(f => f.status === 'pending' && f.direction === 'incoming').length})
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              <Trophy className="w-4 h-4 mr-2" /> Leaderboard
            </TabsTrigger>
            <TabsTrigger value="events" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              <Activity className="w-4 h-4 mr-2" /> Live SSE Logs ({eventLogs.length})
            </TabsTrigger>
            <TabsTrigger value="tester" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
              <Terminal className="w-4 h-4 mr-2" /> API Tester
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Matchmaking & Matches */}
          <TabsContent value="matchmaking" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Matchmaking Queue Controls */}
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-white">
                    <span>Matchmaking Queue</span>
                    {queueStatus.inQueue ? (
                      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse">
                        Searching...
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-slate-400 border-slate-700">
                        Idle
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>Join the 1v1 queue or execute a worker tick to test pairings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {queueStatus.inQueue ? (
                    <div className="space-y-4 bg-slate-950/60 p-4 rounded-lg border border-slate-800">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Game Mode:</span>
                        <span className="font-mono text-indigo-400 font-semibold">{queueStatus.gameMode}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Wait Time:</span>
                        <span className="font-mono text-white">{queueStatus.waitingSeconds}s</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400">Rating Range:</span>
                        <span className="font-mono text-amber-400">±{queueStatus.currentTolerance}</span>
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
                        <label className="text-xs font-medium text-slate-300">Select Game Mode</label>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            type="button"
                            variant={gameMode === "ranked_1v1" ? "default" : "outline"}
                            onClick={() => setGameMode("ranked_1v1")}
                            className={gameMode === "ranked_1v1" ? "bg-indigo-600 hover:bg-indigo-500" : "border-slate-800"}
                          >
                            Ranked 1v1
                          </Button>
                          <Button
                            type="button"
                            variant={gameMode === "casual_1v1" ? "default" : "outline"}
                            onClick={() => setGameMode("casual_1v1")}
                            className={gameMode === "casual_1v1" ? "bg-indigo-600 hover:bg-indigo-500" : "border-slate-800"}
                          >
                            Casual 1v1
                          </Button>
                        </div>
                      </div>

                      <Button
                        onClick={handleJoinQueue}
                        disabled={loadingAction === "join_queue"}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white"
                      >
                        <Play className="w-4 h-4 mr-2" /> Join Queue (POST /api/matchmaking)
                      </Button>
                    </div>
                  )}

                  <Separator className="bg-slate-800" />

                  {/* Manual Worker Tick Button */}
                  <div className="space-y-2 bg-indigo-950/30 border border-indigo-900/40 p-4 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-indigo-300 flex items-center gap-1">
                        <Zap className="w-3.5 h-3.5" /> Worker Simulator
                      </span>
                      <span className="text-[10px] text-indigo-400/70 font-mono">POST /api/matchmaking/tick</span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Instantly triggers the matchmaking pairing pass (normally run on cron). Pairs compatible players in queue into active matches.
                    </p>
                    <Button
                      onClick={handleTriggerTick}
                      disabled={loadingAction === "trigger_tick"}
                      variant="outline"
                      className="w-full border-indigo-800 text-indigo-300 hover:bg-indigo-900/50"
                    >
                      <Play className="w-4 h-4 mr-2" /> Run Matchmaking Tick Now
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Match History & Active Match Reporting */}
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center justify-between">
                    <span>Recent & Active Matches</span>
                    <Button variant="ghost" size="sm" onClick={refreshMatches} className="text-slate-400">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                  </CardTitle>
                  <CardDescription>View matches and report outcomes to test Elo calculation engine</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                  {matches.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm">
                      No matches found. Join queue with 2 users (or multiple browser tabs) and trigger a tick!
                    </div>
                  ) : (
                    matches.map((m) => {
                      const meParticipant = m.players.find((p) => p.playerId === player.id)
                      const opponentParticipant = m.players.find((p) => p.playerId !== player.id)

                      return (
                        <div
                          key={m.id}
                          className="bg-slate-950 border border-slate-800 p-4 rounded-lg space-y-3"
                        >
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-mono text-slate-400">{m.id}</span>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-indigo-400 border-indigo-900">
                                {m.gameMode}
                              </Badge>
                              <Badge
                                className={
                                  m.status === "active"
                                    ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                                    : "bg-slate-800 text-slate-300"
                                }
                              >
                                {m.status}
                              </Badge>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-sm py-1">
                            <div className="font-semibold text-slate-200">
                              You ({meParticipant?.ratingBefore} Elo)
                            </div>
                            <span className="text-slate-500 text-xs font-bold">VS</span>
                            <div className="font-semibold text-slate-200">
                              Opponent ({opponentParticipant?.ratingBefore ?? "???"} Elo)
                            </div>
                          </div>

                          {m.status === "active" ? (
                            <div className="pt-2 border-t border-slate-850 space-y-2">
                              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                                Report Outcome (POST /api/matches/:id)
                              </span>
                              <div className="grid grid-cols-3 gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleReportResult(m.id, player.id)}
                                  disabled={loadingAction === `report_${m.id}`}
                                  className="bg-emerald-700 hover:bg-emerald-600 text-xs"
                                >
                                  Report Win
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleReportResult(m.id, opponentParticipant?.playerId ?? null)}
                                  disabled={loadingAction === `report_${m.id}`}
                                  className="bg-rose-800 hover:bg-rose-700 text-xs"
                                >
                                  Report Loss
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleReportResult(m.id, null)}
                                  disabled={loadingAction === `report_${m.id}`}
                                  variant="secondary"
                                  className="bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs"
                                >
                                  Report Draw
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="pt-2 border-t border-slate-900 flex justify-between items-center text-xs">
                              <span className="text-slate-400">
                                Result:{" "}
                                <span className="font-bold text-white uppercase">{m.result ?? "completed"}</span>
                              </span>
                              {meParticipant?.ratingDelta !== null && meParticipant?.ratingDelta !== undefined && (
                                <span
                                  className={`font-mono font-bold ${
                                    meParticipant.ratingDelta >= 0 ? "text-emerald-400" : "text-rose-400"
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
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white">Send Friend Request</CardTitle>
                  <CardDescription>Enter another player&apos;s username to send a request (POST /api/friends)</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSendFriendRequest} className="flex gap-2">
                    <Input
                      placeholder="Username (e.g. player_two)"
                      value={friendUsername}
                      onChange={(e) => setFriendUsername(e.target.value)}
                      className="bg-slate-950 border-slate-800 text-white"
                    />
                    <Button
                      type="submit"
                      disabled={loadingAction === "send_friend" || !friendUsername.trim()}
                      className="bg-indigo-600 hover:bg-indigo-500"
                    >
                      <UserPlus className="w-4 h-4 mr-2" /> Send
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Friends List */}
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center justify-between">
                    <span>Friendships & Requests</span>
                    <Button variant="ghost" size="sm" onClick={refreshFriends} className="text-slate-400">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                  </CardTitle>
                  <CardDescription>Manage incoming requests, accepted friends, and outgoing pending requests</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 max-h-[500px] overflow-y-auto">
                  {friends.length === 0 ? (
                    <div className="text-center py-8 text-slate-500 text-sm">
                      No friendships found. Send a request to another registered player!
                    </div>
                  ) : (
                    friends.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between bg-slate-950 border border-slate-800 p-3 rounded-lg text-sm"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">
                              {f.friend?.displayName ?? "Unknown Player"}
                            </span>
                            <span className="text-xs text-slate-400">(@{f.friend?.username})</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <Badge variant="outline" className="text-xs py-0 border-slate-800 text-slate-400">
                              {f.status}
                            </Badge>
                            <span className="text-slate-500">{f.direction}</span>
                            {f.friend?.rating && (
                              <span className="text-amber-400 font-mono text-[11px]">{f.friend.rating} Elo</span>
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
                                className="bg-emerald-700 hover:bg-emerald-600 h-8 px-2.5"
                              >
                                <Check className="w-3.5 h-3.5 mr-1" /> Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleRespondFriend(f.id, "decline")}
                                disabled={loadingAction === `friend_${f.id}_decline`}
                                className="border-slate-800 text-slate-400 hover:bg-slate-800 h-8 px-2.5"
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
                            className="text-slate-500 hover:text-rose-400 hover:bg-slate-900 h-8 w-8"
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
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center justify-between">
                  <span>Public Elo Leaderboard</span>
                  <Button variant="ghost" size="sm" onClick={refreshLeaderboard} className="text-slate-400">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                </CardTitle>
                <CardDescription>Top ranked players sorted by Elo rating (GET /api/leaderboard)</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-800 hover:bg-transparent">
                      <TableHead className="w-16 text-slate-400">Rank</TableHead>
                      <TableHead className="text-slate-400">Player</TableHead>
                      <TableHead className="text-slate-400 text-right">Rating</TableHead>
                      <TableHead className="text-slate-400 text-right">Record (W/L/D)</TableHead>
                      <TableHead className="text-slate-400 text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leaderboard.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-slate-500 py-6">
                          No players on leaderboard yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      leaderboard.map((lb) => (
                        <TableRow
                          key={lb.id}
                          className={`border-slate-800 hover:bg-slate-950/50 ${
                            lb.id === player.id ? "bg-indigo-950/20" : ""
                          }`}
                        >
                          <TableCell className="font-mono font-bold text-slate-300">#{lb.rank}</TableCell>
                          <TableCell>
                            <div>
                              <span className="font-semibold text-white">{lb.displayName}</span>
                              <span className="text-xs text-slate-400 ml-2">@{lb.username}</span>
                              {lb.id === player.id && (
                                <Badge className="ml-2 bg-indigo-600 text-white text-[10px]">You</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-amber-400">
                            {lb.rating}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono text-slate-300">
                            <span className="text-emerald-400">{lb.wins}W</span> -{" "}
                            <span className="text-rose-400">{lb.losses}L</span> -{" "}
                            <span className="text-amber-300">{lb.draws}D</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline" className="text-xs border-slate-800 text-slate-400">
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
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center justify-between">
                  <span>Server-Sent Events (SSE) Live Feed</span>
                  <Badge variant="outline" className="text-emerald-400 border-emerald-900">
                    Live Channel: user:{player.userId}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Streaming realtime events emitted by backend services (`publish(userId, event)`)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs max-h-[450px] overflow-y-auto space-y-2">
                  {eventLogs.length === 0 ? (
                    <div className="text-slate-600 text-center py-6">
                      No events received yet. Perform matchmaking or friend actions to trigger realtime events!
                    </div>
                  ) : (
                    eventLogs.map((log, idx) => (
                      <div key={idx} className="border-b border-slate-900 pb-2 text-slate-300">
                        <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                          <span className="text-indigo-400 font-bold">[{log.event.type}]</span>
                          <span>{new Date(log.at).toLocaleTimeString()}</span>
                        </div>
                        <pre className="text-slate-400 whitespace-pre-wrap bg-slate-900/40 p-2 rounded">
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
            <Card className="bg-slate-900 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white">Raw API Endpoint Tester</CardTitle>
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
                    className="bg-slate-950 border border-slate-800 text-white rounded-md px-3 py-2 text-sm font-mono"
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
                    className="bg-slate-950 border-slate-800 text-white font-mono text-sm"
                  />

                  <Button
                    onClick={handleExecuteApiTest}
                    disabled={loadingAction === "api_test"}
                    className="bg-indigo-600 hover:bg-indigo-500 shrink-0"
                  >
                    <Play className="w-4 h-4 mr-2" /> Execute
                  </Button>
                </div>

                {/* Body Input for POST/PATCH */}
                {(apiMethod === "POST" || apiMethod === "PATCH") && (
                  <div className="space-y-1">
                    <label className="text-xs text-slate-400 font-mono">JSON Body Payload:</label>
                    <textarea
                      value={apiBody}
                      onChange={(e) => setApiBody(e.target.value)}
                      placeholder='{"username": "test_player"}'
                      rows={3}
                      className="w-full bg-slate-950 border border-slate-800 text-white rounded-md p-3 font-mono text-xs"
                    />
                  </div>
                )}

                {/* Quick Preset Buttons */}
                <div className="space-y-2">
                  <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider block">
                    Quick Preset Requests:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-slate-800 text-xs"
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
                      className="border-slate-800 text-xs"
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
                      className="border-slate-800 text-xs"
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
                      className="border-slate-800 text-xs"
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
                      className="border-slate-800 text-xs"
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
                      className="border-slate-800 text-xs"
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
                  <div className="space-y-2 border-t border-slate-800 pt-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-300">API Response Output:</span>
                      {apiResponse.status && (
                        <Badge
                          className={
                            apiResponse.status < 400
                              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                              : "bg-rose-500/20 text-rose-400 border-rose-500/30"
                          }
                        >
                          Status: {apiResponse.status}
                        </Badge>
                      )}
                    </div>
                    <pre className="bg-slate-950 border border-slate-800 p-4 rounded-lg text-emerald-400 font-mono text-xs overflow-x-auto max-h-[350px]">
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
