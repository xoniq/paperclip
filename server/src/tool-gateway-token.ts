/**
 * Tool-gateway bearer credentials.
 *
 * The MCP gateway authenticates callers with its own opaque tokens, stored in
 * `toolGatewaySessions` / `toolMcpGatewayTokens` — never in `agentApiKeys` and
 * never as a signed agent JWT. Both the issuing service and `actorMiddleware`
 * read the prefixes from here so the two sides cannot drift apart: the
 * middleware runs before every router and must recognise a gateway credential
 * as "not an agent token, and not an attempt at one" instead of rejecting the
 * request before the gateway route ever sees it.
 */

/** Per-run session token minted by `POST /api/tool-gateway/sessions`. */
export const TOOL_GATEWAY_SESSION_TOKEN_PREFIX = "pcgt_";

/** Long-lived named-gateway client token minted for an MCP client. */
export const TOOL_GATEWAY_NAMED_TOKEN_PREFIX = "pcgw_";

const TOOL_GATEWAY_TOKEN_PREFIXES = [
  TOOL_GATEWAY_SESSION_TOKEN_PREFIX,
  TOOL_GATEWAY_NAMED_TOKEN_PREFIX,
] as const;

/**
 * True when a bearer token is addressed to the tool gateway. Matching on the
 * prefix alone is deliberate: a malformed or revoked gateway token must reach
 * the gateway so it answers with its own diagnosis (`gateway_token_invalid`,
 * `gateway_token_revoked`, the auth-failure throttle) rather than the generic
 * agent-credential failure, which sends operators looking in the wrong place.
 */
export function isToolGatewayBearerToken(token: string): boolean {
  return TOOL_GATEWAY_TOKEN_PREFIXES.some((prefix) => token.startsWith(prefix));
}
