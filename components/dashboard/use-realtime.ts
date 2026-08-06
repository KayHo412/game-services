"use client"

import { useEffect, useState } from "react"

export type RealtimeEvent = {
  event: {
    type: string
    [key: string]: unknown
  }
  at: string
}

/**
 * Subscribes to the /api/events SSE stream and keeps a rolling log of events.
 * onEvent fires for each incoming event so callers can react (e.g. revalidate).
 */
export function useRealtime(onEvent?: (e: RealtimeEvent) => void) {
  const [connected, setConnected] = useState(false)
  const [log, setLog] = useState<RealtimeEvent[]>([])

  useEffect(() => {
    const es = new EventSource("/api/events")

    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)
    es.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data) as RealtimeEvent
        setLog((prev) => [parsed, ...prev].slice(0, 50))
        onEvent?.(parsed)
      } catch {
        // ignore malformed frames
      }
    }

    return () => es.close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { connected, log }
}
