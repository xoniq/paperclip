import { describe, expect, it, vi } from "vitest";
import {
  MCP_HTTP_ACCEPT,
  MCP_SESSION_HEADER,
  getCachedMcpHttpSessionId,
  invalidateMcpHttpSession,
  mcpHttpRequestHeaders,
  parseMcpHttpResponseBody,
  withMcpHttpSessionRetry,
} from "../services/mcp-http.js";

describe("mcpHttpRequestHeaders", () => {
  it("advertises both JSON and SSE on every request", () => {
    expect(mcpHttpRequestHeaders()).toMatchObject({
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    });
    expect(MCP_HTTP_ACCEPT).toBe("application/json, text/event-stream");
  });

  it("preserves caller-supplied headers while keeping the required Accept value", () => {
    expect(mcpHttpRequestHeaders({ Authorization: "Bearer x", accept: "application/json" })).toMatchObject({
      accept: "application/json, text/event-stream",
      Authorization: "Bearer x",
    });
  });
});

describe("parseMcpHttpResponseBody", () => {
  it("parses a plain application/json body", () => {
    const payload = { jsonrpc: "2.0", id: "1", result: { tools: [] } };
    expect(parseMcpHttpResponseBody(JSON.stringify(payload), "application/json")).toEqual(payload);
  });

  it("parses an SSE-framed body, extracting the JSON-RPC message", () => {
    const payload = { jsonrpc: "2.0", id: "1", result: { tools: [{ name: "kv_get" }] } };
    const body = `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
    expect(parseMcpHttpResponseBody(body, "text/event-stream; charset=utf-8")).toEqual(payload);
  });

  it("skips non-JSON-RPC SSE events and returns the response message", () => {
    const ping = "event: ping\ndata: {\"type\":\"ping\"}";
    const message = { jsonrpc: "2.0", id: "1", result: { ok: true } };
    const body = `${ping}\n\nevent: message\ndata: ${JSON.stringify(message)}\n\n`;
    expect(parseMcpHttpResponseBody(body, "text/event-stream")).toEqual(message);
  });

  it("handles multi-line SSE data fields", () => {
    const payload = { jsonrpc: "2.0", id: "1", result: { note: "line" } };
    const json = JSON.stringify(payload, null, 2);
    const body = `data: ${json.split("\n").join("\ndata: ")}\n\n`;
    expect(parseMcpHttpResponseBody(body, "text/event-stream")).toEqual(payload);
  });

  it("throws when an SSE stream carries no data events", () => {
    expect(() => parseMcpHttpResponseBody("event: ping\n\n", "text/event-stream")).toThrow();
  });
});

describe("withMcpHttpSessionRetry", () => {
  const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    });

  it("keeps the sessionless fast path when the server accepts it", async () => {
    const cacheKey = `test-sessionless-${Math.random()}`;
    const send = vi.fn().mockResolvedValue(jsonResponse(200, { jsonrpc: "2.0", id: "1", result: { tools: [] } }));
    const fetchImpl = vi.fn();

    const response = await withMcpHttpSessionRetry({
      cacheKey,
      endpoint: "https://mcp.example.test/mcp",
      send,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({});
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(getCachedMcpHttpSessionId(cacheKey)).toBeNull();
  });

  it("performs the initialize handshake and retries with the session header on 400", async () => {
    const cacheKey = `test-stateful-${Math.random()}`;
    const send = vi.fn(async (sessionHeaders: Record<string, string>) =>
      sessionHeaders[MCP_SESSION_HEADER] === "session-1"
        ? jsonResponse(200, { jsonrpc: "2.0", id: "1", result: { tools: [] } })
        : jsonResponse(400, { jsonrpc: "2.0", error: { code: -32000, message: "Bad Request: Server not initialized" }, id: null }));
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
      if (body.method === "initialize") {
        return jsonResponse(
          200,
          { jsonrpc: "2.0", id: "1", result: { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "test" } } },
          { [MCP_SESSION_HEADER]: "session-1" },
        );
      }
      return jsonResponse(202, {});
    });

    const response = await withMcpHttpSessionRetry({
      cacheKey,
      endpoint: "https://mcp.example.test/mcp",
      send,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(response.status).toBe(200);
    expect(send).toHaveBeenNthCalledWith(1, {});
    expect(send).toHaveBeenNthCalledWith(2, { [MCP_SESSION_HEADER]: "session-1" });
    expect(getCachedMcpHttpSessionId(cacheKey)).toBe("session-1");

    // A follow-up call reuses the cached session without re-initializing.
    fetchImpl.mockClear();
    send.mockClear();
    const second = await withMcpHttpSessionRetry({
      cacheKey,
      endpoint: "https://mcp.example.test/mcp",
      send,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(second.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ [MCP_SESSION_HEADER]: "session-1" });
    expect(fetchImpl).not.toHaveBeenCalled();

    invalidateMcpHttpSession(cacheKey);
  });

  it("returns the original failure when the handshake yields no session id", async () => {
    const cacheKey = `test-no-session-${Math.random()}`;
    const failure = jsonResponse(400, { jsonrpc: "2.0", error: { code: -32000, message: "Bad Request" }, id: null });
    const send = vi.fn().mockResolvedValue(failure);
    const fetchImpl = vi.fn(async () => jsonResponse(200, { jsonrpc: "2.0", id: "1", result: {} }));

    const response = await withMcpHttpSessionRetry({
      cacheKey,
      endpoint: "https://mcp.example.test/mcp",
      send,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(response.status).toBe(400);
    expect(send).toHaveBeenCalledTimes(1);
    expect(getCachedMcpHttpSessionId(cacheKey)).toBeNull();
  });

  it("drops a stale cached session that keeps failing", async () => {
    const cacheKey = `test-stale-${Math.random()}`;
    const send = vi.fn(async (sessionHeaders: Record<string, string>) =>
      sessionHeaders[MCP_SESSION_HEADER] === "fresh"
        ? jsonResponse(200, { jsonrpc: "2.0", id: "1", result: {} })
        : jsonResponse(404, { jsonrpc: "2.0", error: { code: -32001, message: "Session not found" }, id: null }));
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
      return body.method === "initialize"
        ? jsonResponse(200, { jsonrpc: "2.0", id: "1", result: {} }, { [MCP_SESSION_HEADER]: "fresh" })
        : jsonResponse(202, {});
    });

    // Seed a stale session via a first stateful round-trip, then expire it.
    const first = await withMcpHttpSessionRetry({
      cacheKey,
      endpoint: "https://mcp.example.test/mcp",
      send,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(first.status).toBe(200);
    expect(getCachedMcpHttpSessionId(cacheKey)).toBe("fresh");
    invalidateMcpHttpSession(cacheKey);
  });
});
