// Helpers for talking to remote MCP servers over the Streamable HTTP transport.
//
// The MCP Streamable HTTP spec requires the client to advertise that it accepts
// BOTH a single JSON response and an SSE stream on every POST:
//
//   Accept: application/json, text/event-stream
//
// Spec-compliant servers reject requests missing this header with 406 Not
// Acceptable, and when the header is present they are free to answer with an
// SSE stream (`event: message\ndata: {…}`) instead of a bare JSON body. So any
// code path that POSTs JSON-RPC to a remote `/mcp` endpoint must (a) send the
// Accept header and (b) be able to read an SSE-framed response.
//
// Session handshake: many Streamable HTTP servers are stateful — they reject a
// bare `tools/list`/`tools/call` with 400 "Server not initialized" (or 404 for
// an expired session) until the client performs an `initialize` request and
// echoes the returned `Mcp-Session-Id` header on every subsequent POST. Callers
// here try the sessionless fast path first (some hosted servers, e.g. Zapier,
// accept it), then fall back to the handshake via `withMcpHttpSessionRetry`.

import { randomUUID } from "node:crypto";

/** The Accept header value required by the MCP Streamable HTTP transport. */
export const MCP_HTTP_ACCEPT = "application/json, text/event-stream";

/** Header that carries the Streamable HTTP session id, per the MCP spec. */
export const MCP_SESSION_HEADER = "mcp-session-id";

/** Protocol version advertised in the initialize handshake. */
export const MCP_PROTOCOL_VERSION = "2025-03-26";

/**
 * Default headers for an MCP Streamable HTTP JSON-RPC POST. Caller-supplied
 * headers (e.g. resolved credentials) are preserved, while the required
 * Streamable HTTP Accept value is kept authoritative.
 */
export function mcpHttpRequestHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "content-type": "application/json",
    ...extra,
    accept: MCP_HTTP_ACCEPT,
  };
}

function looksLikeJsonRpcMessage(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return "result" in record || "error" in record || "method" in record || "id" in record;
}

/**
 * Parse the body of an MCP Streamable HTTP response into its JSON-RPC payload.
 *
 * Handles both response shapes the transport allows:
 *  - `application/json`: the body is the JSON-RPC message directly.
 *  - `text/event-stream`: one or more SSE events; we return the JSON payload of
 *    the first `data:` event that parses as a JSON-RPC message.
 *
 * Falls back to a plain JSON parse when the content type is unknown so we stay
 * compatible with non-compliant servers that ignore the Accept header.
 */
export function parseMcpHttpResponseBody(bodyText: string, contentType: string | null): unknown {
  const isEventStream = (contentType ?? "").toLowerCase().includes("text/event-stream");
  if (!isEventStream) {
    return JSON.parse(bodyText) as unknown;
  }

  // Split the SSE stream into events on blank lines, then collect each event's
  // `data:` lines (which may span multiple lines per the SSE spec).
  const events = bodyText.replace(/\r\n/g, "\n").split(/\n\n+/);
  let lastError: unknown = null;
  let firstParsed: unknown;
  let sawData = false;
  for (const event of events) {
    const dataLines = event
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).replace(/^ /, ""));
    if (dataLines.length === 0) continue;
    const data = dataLines.join("\n");
    let parsed: unknown;
    try {
      parsed = JSON.parse(data) as unknown;
    } catch (error) {
      lastError = error;
      continue;
    }
    if (!sawData) {
      firstParsed = parsed;
      sawData = true;
    }
    if (looksLikeJsonRpcMessage(parsed)) {
      return parsed;
    }
  }
  if (sawData) return firstParsed;
  if (lastError) throw lastError;
  throw new SyntaxError("MCP SSE response contained no data events");
}

// In-memory session cache keyed by the caller-provided cache key (typically the
// tool connection id). Sessions are cheap to re-establish, so process-local
// caching is enough; an expired session surfaces as 404 and triggers a fresh
// handshake on the next retry.
const mcpHttpSessionCache = new Map<string, string>();

export function getCachedMcpHttpSessionId(cacheKey: string): string | null {
  return mcpHttpSessionCache.get(cacheKey) ?? null;
}

export function invalidateMcpHttpSession(cacheKey: string): void {
  mcpHttpSessionCache.delete(cacheKey);
}

/** True when the upstream response indicates a missing/expired MCP session. */
export function isMcpSessionRequiredStatus(status: number): boolean {
  return status === 400 || status === 404;
}

/**
 * Perform the Streamable HTTP `initialize` handshake and return the session id
 * from the `Mcp-Session-Id` response header (null when the server is
 * sessionless or the handshake fails — callers then keep the original
 * sessionless response).
 */
export async function initializeMcpHttpSession(input: {
  endpoint: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}): Promise<string | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(input.endpoint, {
      method: "POST",
      redirect: "manual",
      headers: mcpHttpRequestHeaders(input.headers),
      signal: input.signal,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `paperclip-init-${randomUUID()}`,
        method: "initialize",
        params: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "paperclip", version: "1.0.0" },
        },
      }),
    });
  } catch {
    return null;
  }
  // Drain the body so the connection can be reused; the session id lives in the
  // response header, not the body.
  await response.text().catch(() => "");
  if (!response.ok) return null;
  const sessionId = response.headers.get(MCP_SESSION_HEADER);
  if (!sessionId) return null;
  // Per the spec the client SHOULD follow up with notifications/initialized.
  // Best-effort: stateful servers we have seen accept requests without it, but
  // stricter ones require it before serving tools/list.
  try {
    const ack = await fetchImpl(input.endpoint, {
      method: "POST",
      redirect: "manual",
      headers: mcpHttpRequestHeaders({ ...input.headers, [MCP_SESSION_HEADER]: sessionId }),
      signal: input.signal,
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    await ack.text().catch(() => "");
  } catch {
    // Ignore: the notification is advisory.
  }
  return sessionId;
}

/**
 * Send a JSON-RPC POST with automatic session fallback.
 *
 * `send` performs the actual POST given the extra headers to merge in (empty on
 * the sessionless fast path, `Mcp-Session-Id` afterwards). When the sessionless
 * attempt is rejected with a session-required status, this performs the
 * initialize handshake once and retries with the session header. The final
 * Response is returned either way; callers keep their own status/body handling.
 */
export async function withMcpHttpSessionRetry(input: {
  cacheKey: string;
  endpoint: string;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  send: (sessionHeaders: Record<string, string>) => Promise<Response>;
}): Promise<Response> {
  const cachedSessionId = getCachedMcpHttpSessionId(input.cacheKey);
  let response = await input.send(
    cachedSessionId ? { [MCP_SESSION_HEADER]: cachedSessionId } : {},
  );
  if (response.ok || !isMcpSessionRequiredStatus(response.status)) return response;
  // The cached session (if any) is stale, or the server requires a session the
  // fast path did not carry. Re-handshake once and retry.
  invalidateMcpHttpSession(input.cacheKey);
  const sessionId = await initializeMcpHttpSession({
    endpoint: input.endpoint,
    headers: input.headers,
    fetchImpl: input.fetchImpl,
    signal: input.signal,
  });
  if (!sessionId) return response;
  mcpHttpSessionCache.set(input.cacheKey, sessionId);
  const retried = await input.send({ [MCP_SESSION_HEADER]: sessionId });
  if (!retried.ok && isMcpSessionRequiredStatus(retried.status)) {
    invalidateMcpHttpSession(input.cacheKey);
  }
  return retried;
}
