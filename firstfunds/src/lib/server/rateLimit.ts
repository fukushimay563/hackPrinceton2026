// Best-effort per-IP rate limit for the AI routes, so a public deployment can't be
// used to run up the Gemini bill. In-memory: on Vercel each function instance keeps
// its own counts, which is fine for an MVP. For a hard limit, use Vercel's WAF rate
// limiting or a shared store (e.g. Upstash Redis).
const hits = new Map<string, { count: number; reset: number }>();

export function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

/** Returns null if allowed, or a 429 Response if the caller is over the limit. */
export function rateLimit(req: Request, key: string, limit: number, windowMs: number): Response | null {
  const id = `${key}:${clientIp(req)}`;
  const now = Date.now();
  const cur = hits.get(id);
  if (!cur || cur.reset < now) {
    hits.set(id, { count: 1, reset: now + windowMs });
    if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    return null;
  }
  cur.count += 1;
  if (cur.count <= limit) return null;
  const retry = Math.ceil((cur.reset - now) / 1000);
  return Response.json({ error: "Too many requests. Please wait a moment and try again." }, { status: 429, headers: { "Retry-After": String(retry) } });
}
