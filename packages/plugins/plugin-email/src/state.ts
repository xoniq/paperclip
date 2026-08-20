import type { PluginContext } from "@paperclipai/plugin-sdk";

/**
 * Send history and rate limiting share one state entry per company.
 *
 * They are the same data viewed two ways: the settings page wants the last N
 * attempts, and the limiter wants how many attempts fall inside a window. A
 * second, separate counter would only add a way for the two to disagree.
 */
const NAMESPACE = "email";
const STATE_KEY = "send-log";

/** Upper bound on retained entries, so a busy company cannot grow the row without limit. */
export const MAX_LOG_ENTRIES = 200;
/** Entries older than this are pruned on write; nothing reads past the 24h window. */
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export interface SendLogEntry {
  /** Epoch milliseconds of the attempt. */
  at: number;
  to: string[];
  subject: string;
  ok: boolean;
  /** Message-ID returned by the server, when the send succeeded. */
  messageId?: string;
  /** Failure reason, when it did not. */
  error?: string;
  /** What triggered the send: an agent run, or the operator's test button. */
  source: "agent" | "test";
  agentId?: string;
  runId?: string;
}

function scopeKey(companyId: string) {
  return { scopeKind: "company" as const, scopeId: companyId, namespace: NAMESPACE, stateKey: STATE_KEY };
}

function isEntry(value: unknown): value is SendLogEntry {
  return (
    typeof value === "object"
    && value !== null
    && typeof (value as SendLogEntry).at === "number"
    && Array.isArray((value as SendLogEntry).to)
  );
}

/** Read the send log, newest first. Tolerates a missing or malformed row. */
export async function readSendLog(ctx: PluginContext, companyId: string): Promise<SendLogEntry[]> {
  const raw = await ctx.state.get(scopeKey(companyId));
  if (!Array.isArray(raw)) return [];
  return raw.filter(isEntry).sort((a, b) => b.at - a.at);
}

/** Append an attempt and prune. Returns the log as written. */
export async function appendSendLog(
  ctx: PluginContext,
  companyId: string,
  entry: SendLogEntry,
  now: number,
): Promise<SendLogEntry[]> {
  const existing = await readSendLog(ctx, companyId);
  const next = [entry, ...existing]
    .filter((item) => now - item.at < RETENTION_MS)
    .slice(0, MAX_LOG_ENTRIES);
  await ctx.state.set(scopeKey(companyId), next);
  return next;
}

export interface RateBudget {
  hourUsed: number;
  hourLimit: number;
  dayUsed: number;
  dayLimit: number;
  /** Epoch ms when the tightest exhausted window frees a slot, or null when sending is allowed. */
  retryAt: number | null;
}

/**
 * Compute the remaining budget from a log.
 *
 * Both successes *and* failures count. An agent stuck in a retry loop against a
 * refusing server is exactly the case the limit exists for, and only counting
 * successes would let it hammer the server forever.
 */
export function computeBudget(
  entries: readonly SendLogEntry[],
  limits: { maxPerHour: number; maxPerDay: number },
  now: number,
): RateBudget {
  const inHour = entries.filter((entry) => now - entry.at < HOUR_MS);
  const inDay = entries.filter((entry) => now - entry.at < DAY_MS);

  let retryAt: number | null = null;
  if (inHour.length >= limits.maxPerHour) {
    // The oldest attempt still inside the window is the one whose expiry frees
    // the next slot.
    const oldestInHour = Math.min(...inHour.map((entry) => entry.at));
    retryAt = oldestInHour + HOUR_MS;
  }
  if (inDay.length >= limits.maxPerDay) {
    const oldestInDay = Math.min(...inDay.map((entry) => entry.at));
    const dayRetry = oldestInDay + DAY_MS;
    retryAt = retryAt == null ? dayRetry : Math.max(retryAt, dayRetry);
  }

  return {
    hourUsed: inHour.length,
    hourLimit: limits.maxPerHour,
    dayUsed: inDay.length,
    dayLimit: limits.maxPerDay,
    retryAt,
  };
}
