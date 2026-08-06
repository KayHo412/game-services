"use client"

/** Thin typed wrapper around the JSON API. Throws on non-ok responses. */
export async function api<T = unknown>(
  path: string,
  options?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(path, {
    method: options?.method ?? "GET",
    headers: options?.body ? { "Content-Type": "application/json" } : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.error ?? `Request failed (${res.status})`)
  }
  return json.data as T
}

export const fetcher = <T = unknown>(path: string) => api<T>(path)
