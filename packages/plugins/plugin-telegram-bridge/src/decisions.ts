import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { InlineKeyboardMarkup } from "./telegram.js";

/**
 * Inline-button decisions: approvals and pending thread interactions.
 *
 * Telegram caps `callback_data` at 64 bytes, which a company id plus an issue
 * id plus an interaction id blows past immediately. So a button carries a short
 * opaque token and the real target lives in plugin state. That also means a
 * button cannot be forged by editing callback data — an unknown token simply
 * resolves to nothing.
 */

const NAMESPACE = "telegram-bridge";

export type DecisionKind = "approval" | "interaction";
export type DecisionAction = "accept" | "reject";

export interface PendingDecision {
  kind: DecisionKind;
  /** Approval id, or interaction id for the interaction kind. */
  targetId: string;
  /** Set for interactions; the host needs the issue to resolve one. */
  issueId?: string;
  /** Short human label echoed back in the confirmation. */
  label: string;
}

/**
 * 12 hex characters is 48 bits — far more than enough to keep concurrent
 * pending decisions distinct, and short enough that the callback payload
 * (`d:<token>:a`) stays well inside the 64-byte limit.
 */
function newToken(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function parseCallbackData(
  data: string | undefined,
): { token: string; action: DecisionAction } | null {
  if (!data) return null;
  const match = /^d:([0-9a-f]{12}):([ar])$/.exec(data);
  if (!match) return null;
  return { token: match[1]!, action: match[2] === "a" ? "accept" : "reject" };
}

/** Store a decision and return the keyboard that points at it. */
export async function createDecisionKeyboard(
  ctx: PluginContext,
  decision: PendingDecision,
  labels: { accept: string; reject: string },
): Promise<InlineKeyboardMarkup> {
  const token = newToken();
  await ctx.state.set(
    { scopeKind: "instance", namespace: NAMESPACE, stateKey: `decision:${token}` },
    decision,
  );
  return {
    inline_keyboard: [
      [
        { text: labels.accept, callback_data: `d:${token}:a` },
        { text: labels.reject, callback_data: `d:${token}:r` },
      ],
    ],
  };
}

export async function readDecision(
  ctx: PluginContext,
  token: string,
): Promise<PendingDecision | null> {
  const value = await ctx.state.get({
    scopeKind: "instance",
    namespace: NAMESPACE,
    stateKey: `decision:${token}`,
  });
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as PendingDecision;
  return typeof candidate.targetId === "string" && typeof candidate.kind === "string"
    ? candidate
    : null;
}

/**
 * Consume a decision token. Deleting it before the host call means a double-tap
 * (Telegram happily delivers the same button twice) cannot decide twice; the
 * host's own idempotent `applied` flag is the second line of defence.
 */
export async function consumeDecision(ctx: PluginContext, token: string): Promise<void> {
  await ctx.state.delete({
    scopeKind: "instance",
    namespace: NAMESPACE,
    stateKey: `decision:${token}`,
  });
}

/**
 * Which issue an approval belongs to, when the payload says so. Approvals carry
 * a free-form payload; `issueId` is the field the core approval flows set.
 */
export function issueIdFromApprovalPayload(payload: Record<string, unknown>): string | null {
  const value = payload.issueId ?? payload.issue_id;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Compact one-line summary of an approval payload for the chat message. */
export function summarizeApprovalPayload(payload: Record<string, unknown>): string | null {
  for (const key of ["summary", "reason", "description", "title", "command", "detail"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim().slice(0, 800);
  }
  return null;
}
