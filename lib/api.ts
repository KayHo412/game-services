import { NextResponse } from "next/server"
import { HttpError } from "@/lib/session"

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status })
}

export function fail(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

/** Wraps a route handler, converting thrown HttpErrors into JSON responses. */
export function handle(fn: () => Promise<Response>): Promise<Response> {
  return fn().catch((err: unknown) => {
    if (err instanceof HttpError) return fail(err.status, err.message)
    console.error("[v0] unhandled route error:", err)
    const message = err instanceof Error ? err.message : "Internal server error"
    return fail(500, message)
  })
}

export function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`
}
