const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const fail = (status, error) => Response.json({ error }, { status, headers });
const allowed = /^(health|streams(?:\/[1-9]\d{0,77})?|users\/0x[\da-f]{40}\/trades)$/i;

/** Public read adapter, never a wallet/RPC/write proxy. */
export async function readProxy(request, { origin, fetchImpl = fetch, timeoutMs = 10_000, maxBytes = 2_097_152 } = {}) {
  if (request.method !== "GET") return new Response(null, { status: 405, headers: { ...headers, Allow: "GET" } });
  const url = new URL(request.url);
  const caller = request.headers.get("Origin");
  if (caller && caller !== url.origin) return fail(403, "cross-origin-denied");
  let path;
  if (url.pathname.startsWith("/vestora-api/")) {
    path = url.pathname.slice("/vestora-api/".length);
    // Vercel retains the original pathname and adds the rewrite's path query.
    const query = [...url.searchParams.entries()];
    if (query.length && !(query.length === 1 && query[0][0] === "path" && query[0][1] === path)) return fail(400, "query-not-supported");
  } else if (url.pathname === "/api/read" && [...url.searchParams.keys()].length === 1) {
    path = url.searchParams.get("path");
  }
  if (!path || !allowed.test(path)) return fail(404, "path-not-allowed");
  let target;
  try {
    target = new URL(origin);
    if (!["http:", "https:"].includes(target.protocol) || target.username || target.password || target.pathname !== "/" || target.search || target.hash) throw new Error();
  } catch { return fail(503, "upstream-not-configured"); }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(new URL(path, target), {
      method: "GET", redirect: "error", cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.any([request.signal, controller.signal]),
    });
    if (response.status >= 300 && response.status < 400) return fail(502, "upstream-redirect-denied");
    if (!response.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) return fail(502, "upstream-invalid-content");
    const length = response.headers.get("Content-Length");
    if (length && Number(length) > maxBytes) { await response.body?.cancel(); return fail(502, "upstream-response-too-large"); }
    const reader = response.body?.getReader(), chunks = [];
    let size = 0;
    if (reader) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) { await reader.cancel(); return fail(502, "upstream-response-too-large"); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new Response(bytes, { status: response.status, headers });
  } catch { return fail(controller.signal.aborted ? 504 : 502, "upstream-unavailable"); }
  finally { clearTimeout(timer); }
}
