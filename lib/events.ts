import { EventEmitter } from "events"

/**
 * Simple in-process pub/sub used to push realtime events to connected
 * clients over Server-Sent Events. In a horizontally-scaled deployment this
 * would be backed by Redis pub/sub; for a single instance an EventEmitter is
 * enough and keeps the demo dependency-free.
 */

export type GameEvent =
  | { type: "match_found"; matchId: string; opponent: string; gameMode: string }
  | { type: "match_completed"; matchId: string; result: string; ratingDelta: number }
  | { type: "queue_update"; status: string; waiting: number }
  | { type: "friend_request"; from: string }
  | { type: "friend_accepted"; by: string }
  | { type: "presence"; status: string }

type Envelope = { event: GameEvent; at: string }

// Reuse a single emitter across hot reloads in dev.
const globalForBus = globalThis as unknown as { __gameBus?: EventEmitter }
const bus = globalForBus.__gameBus ?? new EventEmitter()
bus.setMaxListeners(0)
if (!globalForBus.__gameBus) globalForBus.__gameBus = bus

function channel(userId: string) {
  return `user:${userId}`
}

export function publish(userId: string, event: GameEvent) {
  const envelope: Envelope = { event, at: new Date().toISOString() }
  bus.emit(channel(userId), envelope)
}

export function subscribe(userId: string, listener: (env: Envelope) => void) {
  const ch = channel(userId)
  bus.on(ch, listener)
  return () => bus.off(ch, listener)
}
