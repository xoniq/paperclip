import type { PluginContext } from "@paperclipai/plugin-sdk";

/**
 * Chat ↔ issue mapping.
 *
 * Two directions are stored because both are hot paths:
 * - inbound needs chat/topic → issue, keyed in instance state;
 * - outbound needs issue → chat/topic, keyed in issue state, so a comment
 *   event can be routed without scanning every mapping.
 *
 * The mapping is deliberately plugin state rather than a database namespace:
 * it is small, entirely derived, and cheap to rebuild by starting a new
 * conversation if it is ever lost.
 */

const NAMESPACE = "telegram-bridge";

/** Where a relayed message should land in Telegram. */
export interface ChatTarget {
  chatId: number;
  /** Forum topic id, or null for a plain (non-forum) chat. */
  threadId: number | null;
}

export function chatTargetKey(target: ChatTarget): string {
  return `chat:${target.chatId}:${target.threadId ?? "root"}`;
}

function isChatTarget(value: unknown): value is ChatTarget {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { chatId?: unknown; threadId?: unknown };
  return (
    typeof candidate.chatId === "number"
    && (candidate.threadId === null || typeof candidate.threadId === "number")
  );
}

/** Resolve the issue bound to a Telegram chat/topic, if any. */
export async function getIssueForChat(
  ctx: PluginContext,
  target: ChatTarget,
): Promise<string | null> {
  const value = await ctx.state.get({
    scopeKind: "instance",
    namespace: NAMESPACE,
    stateKey: chatTargetKey(target),
  });
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Resolve where an issue's comments should be relayed to, if anywhere. */
export async function getChatForIssue(
  ctx: PluginContext,
  issueId: string,
): Promise<ChatTarget | null> {
  const value = await ctx.state.get({
    scopeKind: "issue",
    scopeId: issueId,
    namespace: NAMESPACE,
    stateKey: "chat-target",
  });
  return isChatTarget(value) ? value : null;
}

/** Bind a Telegram chat/topic to an issue in both directions. */
export async function bindChatToIssue(
  ctx: PluginContext,
  target: ChatTarget,
  issueId: string,
): Promise<void> {
  await ctx.state.set(
    { scopeKind: "instance", namespace: NAMESPACE, stateKey: chatTargetKey(target) },
    issueId,
  );
  await ctx.state.set(
    { scopeKind: "issue", scopeId: issueId, namespace: NAMESPACE, stateKey: "chat-target" },
    target,
  );
}

/**
 * The standing conversation lane for a thread — the issue that carries messages
 * not tied to a specific task.
 *
 * Keyed per thread, not per chat. Keying it per chat would send the agent's
 * reply to whichever thread the lane was first created in, so talking in a
 * second topic would answer in the first one.
 */
export async function getStandingIssue(
  ctx: PluginContext,
  target: ChatTarget,
): Promise<string | null> {
  const value = await ctx.state.get({
    scopeKind: "instance",
    namespace: NAMESPACE,
    stateKey: `standing:${chatTargetKey(target)}`,
  });
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function setStandingIssue(
  ctx: PluginContext,
  target: ChatTarget,
  issueId: string,
): Promise<void> {
  await ctx.state.set(
    { scopeKind: "instance", namespace: NAMESPACE, stateKey: `standing:${chatTargetKey(target)}` },
    issueId,
  );
}

/**
 * Interactions already announced in Telegram, per issue. Without this, every
 * later comment on the issue would repost the same decision buttons.
 *
 * Bounded to the most recent ids: an issue only ever has a handful of live
 * decision cards, and stale entries cost nothing once resolved.
 */
const MAX_ANNOUNCED_INTERACTIONS = 25;

export async function getAnnouncedInteractions(
  ctx: PluginContext,
  issueId: string,
): Promise<string[]> {
  const value = await ctx.state.get({
    scopeKind: "issue",
    scopeId: issueId,
    namespace: NAMESPACE,
    stateKey: "announced-interactions",
  });
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export async function addAnnouncedInteraction(
  ctx: PluginContext,
  issueId: string,
  interactionId: string,
): Promise<void> {
  const existing = await getAnnouncedInteractions(ctx, issueId);
  if (existing.includes(interactionId)) return;
  const next = [...existing, interactionId].slice(-MAX_ANNOUNCED_INTERACTIONS);
  await ctx.state.set(
    { scopeKind: "issue", scopeId: issueId, namespace: NAMESPACE, stateKey: "announced-interactions" },
    next,
  );
}

/**
 * The last chat the operator spoke in. Used as the delivery target for
 * company-wide notifications (budget stops, run failures) that are not tied to
 * a mapped issue, when no explicit notification chat is configured.
 */
export async function getLastActiveTarget(ctx: PluginContext): Promise<ChatTarget | null> {
  const value = await ctx.state.get({
    scopeKind: "instance",
    namespace: NAMESPACE,
    stateKey: "last-active-target",
  });
  return isChatTarget(value) ? value : null;
}

export async function setLastActiveTarget(ctx: PluginContext, target: ChatTarget): Promise<void> {
  await ctx.state.set(
    { scopeKind: "instance", namespace: NAMESPACE, stateKey: "last-active-target" },
    target,
  );
}

/**
 * Recently handled webhook update ids.
 *
 * Telegram redelivers any webhook it did not get a 200 for, so a retry after a
 * slow-but-successful handler would post the same message twice. Polling does
 * not need this — the offset already de-duplicates there.
 */
const MAX_SEEN_UPDATES = 200;

export async function wasUpdateSeen(ctx: PluginContext, updateId: number): Promise<boolean> {
  const value = await ctx.state.get({
    scopeKind: "instance",
    namespace: NAMESPACE,
    stateKey: "seen-webhook-updates",
  });
  return Array.isArray(value) && value.includes(updateId);
}

export async function markUpdateSeen(ctx: PluginContext, updateId: number): Promise<void> {
  const value = await ctx.state.get({
    scopeKind: "instance",
    namespace: NAMESPACE,
    stateKey: "seen-webhook-updates",
  });
  const existing = Array.isArray(value)
    ? value.filter((entry): entry is number => typeof entry === "number")
    : [];
  await ctx.state.set(
    { scopeKind: "instance", namespace: NAMESPACE, stateKey: "seen-webhook-updates" },
    [...existing, updateId].slice(-MAX_SEEN_UPDATES),
  );
}

/** Long-poll offset, so a worker restart does not replay old updates. */
export async function getUpdateOffset(ctx: PluginContext): Promise<number | undefined> {
  const value = await ctx.state.get({
    scopeKind: "instance",
    namespace: NAMESPACE,
    stateKey: "update-offset",
  });
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

export async function setUpdateOffset(ctx: PluginContext, offset: number): Promise<void> {
  await ctx.state.set(
    { scopeKind: "instance", namespace: NAMESPACE, stateKey: "update-offset" },
    offset,
  );
}
