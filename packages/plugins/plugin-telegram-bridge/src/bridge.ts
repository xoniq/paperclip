import type { Issue, PluginContext, PluginEvent } from "@paperclipai/plugin-sdk";
import { PLUGIN_ID } from "./manifest.js";
import type { BridgeConfig } from "./config.js";
import { resolveBotToken } from "./config.js";
import {
  addAnnouncedInteraction,
  bindChatToIssue,
  chatTargetKey,
  getAnnouncedInteractions,
  getChatForIssue,
  getIssueForChat,
  getLastActiveTarget,
  getStandingIssue,
  setLastActiveTarget,
  setStandingIssue,
  type ChatTarget,
} from "./mapping.js";
import {
  consumeDecision,
  createDecisionKeyboard,
  issueIdFromApprovalPayload,
  parseCallbackData,
  readDecision,
  summarizeApprovalPayload,
} from "./decisions.js";
import {
  createTelegramClient,
  describeAttachment,
  renderForTelegram,
  TELEGRAM_MAX_MESSAGE_CHARS,
  TelegramApiError,
  type InlineKeyboardMarkup,
  type TelegramCallbackQuery,
  type TelegramClient,
  type TelegramMessage,
  type TelegramUpdate,
} from "./telegram.js";

/** Statuses where an issue no longer wakes its assignee on a new comment. */
const TERMINAL_STATUSES = new Set<Issue["status"]>(["done", "cancelled"]);

const HELP_TEXT = [
  "**Paperclip bridge**",
  "",
  "Just type to talk in this thread. Every message reaches the agent and its replies come back here.",
  "",
  "`/new <title>` — start a new task (opens its own topic in a forum group)",
  "`/status` — status of this thread's task",
  "`/tasks` — open tasks assigned to the agent",
  "`/done` — close this thread's task",
  "`/pending` — approvals and decisions waiting on you",
  "`/here` — send alerts to this thread from now on",
  "`/whoami` — show your Telegram user ID",
  "",
  "Approvals and confirmations arrive as buttons — tap to decide.",
].join("\n");

export interface BridgeDeps {
  ctx: PluginContext;
  config: BridgeConfig;
  companyId: string;
}

export interface Bridge {
  handleUpdate(update: TelegramUpdate): Promise<void>;
  handleRunStarted(event: PluginEvent): Promise<void>;
  handleRunEnded(event: PluginEvent): Promise<void>;
  handleCommentCreated(event: PluginEvent): Promise<void>;
  handleIssueUpdated(event: PluginEvent): Promise<void>;
  handleApprovalCreated(event: PluginEvent): Promise<void>;
  handleRunFailed(event: PluginEvent): Promise<void>;
  handleBudgetIncident(event: PluginEvent): Promise<void>;
}

/**
 * A message this bridge posted must never be relayed back to Telegram, or the
 * two surfaces echo each other indefinitely. Plugin-authored mutations carry
 * `sourcePluginKey` in their activity details, so the check is exact — it does
 * not accidentally suppress comments you wrote in the web UI.
 */
function isOwnEcho(event: PluginEvent): boolean {
  const payload = (event.payload ?? {}) as { sourcePluginKey?: unknown };
  return event.actorType === "plugin" && payload.sourcePluginKey === PLUGIN_ID;
}

function readMessage(update: TelegramUpdate): TelegramMessage | null {
  // An edit is relayed as a new, explicitly-marked comment rather than being
  // dropped: the agent may already have acted on the original wording, so it
  // needs to see the correction.
  return update.message ?? update.edited_message ?? null;
}

function targetFromMessage(message: TelegramMessage): ChatTarget {
  return {
    chatId: message.chat.id,
    threadId: typeof message.message_thread_id === "number" ? message.message_thread_id : null,
  };
}

function describeIssue(issue: Issue): string {
  const identifier = issue.identifier ?? issue.id.slice(0, 8);
  return `${identifier} — ${issue.title} [${issue.status}]`;
}

/** Budget amounts travel as billed cents. */
function formatCents(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `$${(value / 100).toFixed(2)}`;
}

export function createBridge(deps: BridgeDeps): Bridge {
  const { ctx, config, companyId } = deps;
  let cachedAgentId: string | null = null;

  async function client(): Promise<TelegramClient> {
    const token = await resolveBotToken(ctx, config, companyId);
    return createTelegramClient({ token, fetch: (url, init) => ctx.http.fetch(url, init) });
  }

  /**
   * Resolve the agent that owns the chat threads. An explicit id wins; without
   * one the first active agent whose role matches `agentRole` is used.
   */
  async function resolveAgentId(): Promise<string> {
    if (config.agentId) return config.agentId;
    if (cachedAgentId) return cachedAgentId;

    const agents = await ctx.agents.list({ companyId });
    const wanted = config.agentRole.trim().toLowerCase();
    const match = agents.find(
      (agent) => (agent.role ?? "").trim().toLowerCase() === wanted && agent.status !== "terminated",
    );
    if (!match) {
      throw new Error(
        `No agent with role "${config.agentRole}" in this company. Set agentId explicitly in the plugin settings.`,
      );
    }
    cachedAgentId = match.id;
    return match.id;
  }

  /** Name an agent for an alert, falling back to the id when it cannot be read. */
  async function describeAgent(agentId: unknown): Promise<string> {
    if (typeof agentId !== "string" || agentId.length === 0) return "an agent";
    try {
      const agent = await ctx.agents.get(agentId, companyId);
      return agent ? `${agent.name} (${agent.role})` : agentId.slice(0, 8);
    } catch {
      return agentId.slice(0, 8);
    }
  }

  /**
   * Where company-wide notifications go when they are not tied to a mapped
   * issue: the configured chat if set, otherwise the last chat you spoke in.
   */
  async function fallbackTarget(): Promise<ChatTarget | null> {
    if (config.notificationChatId !== null) {
      return { chatId: config.notificationChatId, threadId: config.notificationThreadId };
    }
    return await getLastActiveTarget(ctx);
  }

  async function send(
    target: ChatTarget,
    body: string,
    header?: string,
    keyboard?: InlineKeyboardMarkup,
  ): Promise<void> {
    const api = await client();
    const chunks = renderForTelegram(body, header);
    for (const [index, chunk] of chunks.entries()) {
      // Buttons belong on the last chunk, where the reader ends up.
      const replyMarkup = index === chunks.length - 1 ? keyboard ?? null : null;
      try {
        await api.sendMessage({
          chatId: target.chatId,
          messageThreadId: target.threadId,
          text: chunk,
          parseMode: "HTML",
          replyMarkup,
        });
      } catch (error) {
        // A malformed entity should cost the formatting, not the message.
        if (error instanceof TelegramApiError && error.errorCode === 400) {
          ctx.logger.warn("Telegram rejected HTML payload, retrying as plain text", {
            reason: error.message,
          });
          await api.sendMessage({
            chatId: target.chatId,
            messageThreadId: target.threadId,
            // Drop the tags and put the escaped entities back, so the plain
            // text reads as prose rather than as "&lt;div&gt;".
            text: chunk
              .replace(/<[^>]+>/g, "")
              .replaceAll("&lt;", "<")
              .replaceAll("&gt;", ">")
              .replaceAll("&amp;", "&")
              .slice(0, TELEGRAM_MAX_MESSAGE_CHARS),
            parseMode: null,
            replyMarkup,
          });
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Live "typing…" indicator, driven by the agent's actual run lifecycle.
   *
   * Telegram clears a chat action after about five seconds, so a one-shot call
   * only covers the moment the message is relayed — not the minutes the agent
   * spends working. Refreshing on a timer for as long as a run is open turns
   * the indicator into an honest signal: it is visible exactly while the agent
   * is running, and stops the moment the run ends.
   */
  const TYPING_REFRESH_MS = 4_000;
  /** Hard stop, so a run that never reports a terminal status cannot type forever. */
  const TYPING_MAX_MS = 10 * 60 * 1_000;

  const typingByRun = new Map<string, { timer: ReturnType<typeof setInterval>; deadline: ReturnType<typeof setTimeout> }>();

  function stopTyping(runId: string): void {
    const active = typingByRun.get(runId);
    if (!active) return;
    clearInterval(active.timer);
    clearTimeout(active.deadline);
    typingByRun.delete(runId);
  }

  async function sendTyping(target: ChatTarget): Promise<void> {
    try {
      await (await client()).sendChatAction({
        chatId: target.chatId,
        messageThreadId: target.threadId,
      });
    } catch {
      // Purely cosmetic — never let it surface.
    }
  }

  async function startTyping(runId: string, target: ChatTarget): Promise<void> {
    stopTyping(runId);
    // Awaited, not fire-and-forget: the first tick is what makes the indicator
    // appear at the moment the run starts rather than four seconds later.
    await sendTyping(target);
    const timer = setInterval(() => void sendTyping(target), TYPING_REFRESH_MS);
    const deadline = setTimeout(() => stopTyping(runId), TYPING_MAX_MS);
    // Neither timer should hold the worker process open on shutdown.
    timer.unref?.();
    deadline.unref?.();
    typingByRun.set(runId, { timer, deadline });
  }

  /** Resolve the chat a run belongs to, via the issue it is working on. */
  async function targetForRun(payload: Record<string, unknown>): Promise<ChatTarget | null> {
    const issueId = typeof payload.issueId === "string" ? payload.issueId : null;
    if (!issueId) return null;
    return await getChatForIssue(ctx, issueId);
  }

  async function createIssueForChat(input: {
    target: ChatTarget;
    title: string;
    description?: string;
    originId: string;
  }): Promise<Issue> {
    const issue = await ctx.issues.create({
      companyId,
      title: input.title,
      description: input.description,
      status: "todo",
      assigneeAgentId: await resolveAgentId(),
      ...(config.projectId ? { projectId: config.projectId } : {}),
      originKind: `plugin:${PLUGIN_ID}:telegram-chat`,
      originId: input.originId,
    });
    await bindChatToIssue(ctx, input.target, issue.id);
    return issue;
  }

  /**
   * The always-on lane for a thread.
   *
   * A closed lane is reused, not replaced. Paperclip expects an assigned issue
   * to reach a disposition: when a run finishes and the issue still has no
   * clear next step, the host queues a corrective handoff wake, which starts
   * another run, which again ends with nothing to decide. A lane pinned open
   * forever therefore loops on every heartbeat. Letting the agent close the
   * lane and reopening it on your next message is the shape the host is built
   * around — `relayToIssue` reopens it, so a closed lane costs nothing.
   */
  async function resolveStandingIssue(target: ChatTarget): Promise<Issue> {
    const existingId = await getStandingIssue(ctx, target);
    if (existingId) {
      const existing = await ctx.issues.get(existingId, companyId);
      if (existing) return existing;
    }

    const issue = await createIssueForChat({
      target,
      title: target.threadId
        ? `${config.standingChatTitle} — topic ${target.threadId}`
        : config.standingChatTitle,
      description:
        "Standing conversation lane for the Telegram bridge. Messages in this thread that are not tied to a specific task land here.",
      originId: `standing:${chatTargetKey(target)}`,
    });
    await setStandingIssue(ctx, target, issue.id);
    return issue;
  }

  /** Resolve the issue a message belongs to, creating the standing lane if needed. */
  async function resolveIssueForTarget(target: ChatTarget): Promise<Issue> {
    const boundId = await getIssueForChat(ctx, target);
    if (boundId) {
      const bound = await ctx.issues.get(boundId, companyId);
      if (bound) return bound;
      ctx.logger.warn("Mapped issue no longer exists, falling back to the standing lane", {
        issueId: boundId,
      });
    }
    return await resolveStandingIssue(target);
  }

  /**
   * Post an inbound message as the operator's own comment. This is what wakes
   * the assignee: a human-attributed comment participates in the same wake
   * path a board comment does. A terminal issue is reopened first, otherwise
   * the comment lands silently and nothing runs.
   */
  async function relayToIssue(issue: Issue, text: string): Promise<void> {
    if (TERMINAL_STATUSES.has(issue.status)) {
      await ctx.issues.update(issue.id, { status: "todo" }, companyId);
    }
    await ctx.issues.createComment(issue.id, text, companyId, {
      actorUserId: config.operatorUserId,
    });
  }

  async function handleCommand(
    message: TelegramMessage,
    target: ChatTarget,
    command: string,
    argument: string,
  ): Promise<void> {
    switch (command) {
      case "/start":
      case "/help": {
        await send(target, HELP_TEXT);
        return;
      }

      case "/whoami": {
        await send(target, `Your Telegram user ID is \`${message.from?.id ?? "unknown"}\`.`);
        return;
      }

      case "/new": {
        const title = argument.trim();
        if (!title) {
          await send(target, "Give the task a title: `/new Draft the Q3 plan`");
          return;
        }

        // In a forum group each task gets its own topic, which is what makes
        // "new task = new chat" literal. Elsewhere the task takes over the
        // current thread.
        let taskTarget = target;
        if (message.chat.is_forum) {
          const api = await client();
          try {
            const topic = await api.createForumTopic({ chatId: target.chatId, name: title });
            taskTarget = { chatId: target.chatId, threadId: topic.message_thread_id };
          } catch (error) {
            ctx.logger.warn("Could not create a forum topic; using the current thread", {
              reason: error instanceof Error ? error.message : String(error),
            });
          }
        }

        const issue = await createIssueForChat({
          target: taskTarget,
          title,
          description: `Started from Telegram by user ${message.from?.id ?? "unknown"}.`,
          originId: `task:${target.chatId}:${message.message_id}`,
        });
        await ctx.issues.requestWakeup(issue.id, companyId, {
          reason: "telegram_task_created",
          contextSource: "telegram-bridge.new",
        });
        await send(taskTarget, `Task created: ${describeIssue(issue)}\n\nAnything you send here goes to this task.`);
        if (taskTarget.threadId !== target.threadId) {
          await send(target, `Opened a topic for ${describeIssue(issue)}.`);
        }
        return;
      }

      case "/status": {
        const issue = await resolveIssueForTarget(target);
        await send(target, describeIssue(issue));
        return;
      }

      case "/done": {
        const boundId = await getIssueForChat(ctx, target);
        if (!boundId) {
          await send(target, "This thread is not bound to a task.");
          return;
        }
        const issue = await ctx.issues.update(boundId, { status: "done" }, companyId);
        await send(target, `Closed ${describeIssue(issue)}.`);
        return;
      }

      case "/tasks": {
        const agentId = await resolveAgentId();
        const issues = await ctx.issues.list({ companyId, assigneeAgentId: agentId, limit: 20 });
        const open = issues.filter((issue) => !TERMINAL_STATUSES.has(issue.status));
        await send(
          target,
          open.length === 0
            ? "No open tasks."
            : ["**Open tasks**", ...open.map((issue) => `• ${describeIssue(issue)}`)].join("\n"),
        );
        return;
      }

      case "/pending": {
        const approvals = await ctx.approvals.list({ companyId, status: "pending" });
        if (approvals.length === 0) {
          await send(target, "Nothing waiting on you.");
        }
        // Re-issue buttons rather than listing text: the point of asking is to
        // be able to decide right here.
        for (const approval of approvals) {
          const keyboard = await createDecisionKeyboard(
            ctx,
            { kind: "approval", targetId: approval.id, label: approval.type },
            { accept: "✅ Approve", reject: "✖️ Reject" },
          );
          await send(
            target,
            [`**Approval needed** — ${approval.type}`, summarizeApprovalPayload(approval.payload)]
              .filter(Boolean)
              .join("\n\n"),
            undefined,
            keyboard,
          );
        }
        return;
      }

      case "/here": {
        await setLastActiveTarget(ctx, target);
        await send(
          target,
          config.notificationChatId === null
            ? "Alerts that are not tied to a task will arrive in this thread."
            : "A notification chat is pinned in the plugin settings, so alerts keep going there.",
        );
        return;
      }

      default: {
        await send(target, `Unknown command \`${command}\`. Try \`/help\`.`);
      }
    }
  }

  /**
   * Resolve a tapped button.
   *
   * The decision is attributed to the configured operator, and the host
   * re-verifies independently that this user is an active human member before
   * applying it — a plugin can only ever decide as an identity that could have
   * decided in the web app.
   */
  async function handleCallbackQuery(query: TelegramCallbackQuery): Promise<void> {
    const api = await client();

    const answer = async (text: string) => {
      try {
        await api.answerCallbackQuery({ callbackQueryId: query.id, text });
      } catch (error) {
        ctx.logger.warn("Could not acknowledge callback query", {
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    };

    if (!config.allowedTelegramUserIds.includes(query.from.id)) {
      ctx.logger.warn("Ignored a button tap from a non-allowlisted sender", {
        senderId: query.from.id,
      });
      await answer("Not authorized.");
      return;
    }

    const parsed = parseCallbackData(query.data);
    if (!parsed) {
      await answer("This button is no longer valid.");
      return;
    }

    const decision = await readDecision(ctx, parsed.token);
    if (!decision) {
      // Either already tapped, or the state entry is gone after a reinstall.
      await answer("This decision was already handled.");
      await stripKeyboard(query);
      return;
    }

    // Consume before deciding: Telegram happily delivers a double-tap, and the
    // host's own idempotency is the second line of defence, not the first.
    await consumeDecision(ctx, parsed.token);

    try {
      if (decision.kind === "approval") {
        const result = await ctx.approvals.decide(
          decision.targetId,
          {
            action: parsed.action === "accept" ? "approve" : "reject",
            actorUserId: config.operatorUserId,
            decisionNote: "Decided from Telegram",
          },
          companyId,
        );
        await answer(result.applied
          ? `Approval ${parsed.action === "accept" ? "approved" : "rejected"}.`
          : "Already decided.");
      } else if (decision.issueId) {
        const result = await ctx.issues.respondInteraction(
          decision.issueId,
          decision.targetId,
          { action: parsed.action, actorUserId: config.operatorUserId, reason: "Decided from Telegram" },
          companyId,
        );
        await answer(result.applied
          ? `${parsed.action === "accept" ? "Approved" : "Rejected"}.`
          : "Already resolved.");
      } else {
        await answer("This decision is missing its issue and cannot be applied.");
        return;
      }
    } catch (error) {
      ctx.logger.error("Failed to apply a decision from Telegram", {
        kind: decision.kind,
        targetId: decision.targetId,
        reason: error instanceof Error ? error.message : String(error),
      });
      await answer("Could not apply that — check the board.");
      return;
    }

    await stripKeyboard(query);
  }

  /** Remove the buttons once a decision is made, so it cannot be tapped again. */
  async function stripKeyboard(query: TelegramCallbackQuery): Promise<void> {
    if (!query.message) return;
    try {
      await (await client()).clearInlineKeyboard({
        chatId: query.message.chat.id,
        messageId: query.message.message_id,
      });
    } catch {
      // Cosmetic only; the token is already consumed.
    }
  }

  /**
   * Surface any pending decision card on an issue as inline buttons.
   *
   * Interactions have no domain event of their own, but an agent always creates
   * one alongside a comment — so a comment landing on a mapped issue is the
   * reliable moment to check. Already-announced interactions are remembered so
   * a later comment does not repost the same buttons.
   */
  async function surfacePendingInteractions(issueId: string, target: ChatTarget): Promise<void> {
    let interactions;
    try {
      interactions = await ctx.issues.listInteractions(issueId, companyId);
    } catch (error) {
      ctx.logger.warn("Could not read thread interactions", {
        issueId,
        reason: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const announced = await getAnnouncedInteractions(ctx, issueId);
    for (const interaction of interactions) {
      if (interaction.status !== "pending" || announced.includes(interaction.id)) continue;

      // Only yes/no shapes map onto two buttons. Questions and multi-select
      // cards are answered by replying in the thread, which already works.
      const decidable = interaction.kind === "request_confirmation" || interaction.kind === "suggest_tasks";
      const title = interaction.title ?? "The agent is waiting on you";
      const summary = interaction.summary ? `\n\n${interaction.summary}` : "";

      if (!decidable) {
        await send(target, `${title}${summary}\n\n_Reply here to answer._`);
      } else {
        const keyboard = await createDecisionKeyboard(
          ctx,
          { kind: "interaction", targetId: interaction.id, issueId, label: title },
          { accept: "✅ Approve", reject: "✖️ Reject" },
        );
        await send(target, `${title}${summary}`, undefined, keyboard);
      }

      await addAnnouncedInteraction(ctx, issueId, interaction.id);
    }
  }

  return {
    async handleUpdate(update) {
      if (update.callback_query) {
        await handleCallbackQuery(update.callback_query);
        return;
      }

      const edited = Boolean(update.edited_message);
      const message = readMessage(update);
      if (!message) return;

      const senderId = message.from?.id;
      if (typeof senderId !== "number" || !config.allowedTelegramUserIds.includes(senderId)) {
        // Stay silent: replying would confirm the bot is live to whoever
        // found it. The log line is enough to notice a probe.
        ctx.logger.warn("Ignored Telegram message from a non-allowlisted sender", {
          senderId: senderId ?? null,
          chatId: message.chat.id,
        });
        return;
      }

      const target = targetFromMessage(message);
      // Remember where you last spoke, so alerts that belong to no particular
      // task still have somewhere to go without extra configuration.
      await setLastActiveTarget(ctx, target);

      const text = (message.text ?? message.caption ?? "").trim();
      const attachment = describeAttachment(message);
      if (!text && !attachment) return;

      if (!edited && text.startsWith("/")) {
        const [rawCommand, ...rest] = text.split(/\s+/);
        // Telegram appends @botname to commands in groups.
        const command = (rawCommand ?? "").split("@")[0]!.toLowerCase();
        await handleCommand(message, target, command, rest.join(" "));
        return;
      }

      // An edit becomes a new comment rather than a silent rewrite, because the
      // agent may already have acted on the original wording.
      const body = [
        edited ? "(edited message)" : null,
        attachment,
        text || null,
      ]
        .filter(Boolean)
        .join("\n");

      const issue = await resolveIssueForTarget(target);
      await relayToIssue(issue, body);

      // A first tick right away, so the gap between sending and the agent run
      // actually starting does not read as silence. handleRunStarted takes
      // over from here and keeps it alive for as long as the agent works.
      await sendTyping(target);
    },

    async handleCommentCreated(event) {
      if (isOwnEcho(event)) return;

      const issueId = event.entityId;
      if (!issueId) return;

      const target = await getChatForIssue(ctx, issueId);
      if (!target) return;

      const payload = (event.payload ?? {}) as { commentId?: unknown };
      const commentId = typeof payload.commentId === "string" ? payload.commentId : null;
      if (!commentId) return;

      // The event carries a 120-character snippet only; the full body has to
      // be read back.
      const comments = await ctx.issues.listComments(issueId, companyId);
      const comment = comments.find((entry) => entry.id === commentId);
      if (!comment || comment.deletedAt) return;

      const header = comment.authorType === "agent" ? undefined : "From the board:";
      await send(target, comment.body, header);
      await surfacePendingInteractions(issueId, target);
    },

    async handleRunStarted(event) {
      const runId = typeof (event.payload as { runId?: unknown })?.runId === "string"
        ? (event.payload as { runId: string }).runId
        : null;
      if (!runId) return;

      const target = await targetForRun((event.payload ?? {}) as Record<string, unknown>);
      if (!target) return;
      await startTyping(runId, target);
    },

    async handleRunEnded(event) {
      const runId = typeof (event.payload as { runId?: unknown })?.runId === "string"
        ? (event.payload as { runId: string }).runId
        : null;
      if (runId) stopTyping(runId);
    },

    async handleApprovalCreated(event) {
      const approvalId = event.entityId;
      if (!approvalId) return;

      const approval = await ctx.approvals.get(approvalId, companyId);
      if (!approval || approval.status !== "pending") return;

      // Route to the thread the work belongs to when the payload names an
      // issue; otherwise fall back to the configured notification chat.
      const issueId = issueIdFromApprovalPayload(approval.payload);
      const target = (issueId ? await getChatForIssue(ctx, issueId) : null) ?? (await fallbackTarget());
      if (!target) return;

      const summary = summarizeApprovalPayload(approval.payload);
      const keyboard = await createDecisionKeyboard(
        ctx,
        { kind: "approval", targetId: approval.id, label: approval.type },
        { accept: "✅ Approve", reject: "✖️ Reject" },
      );

      await send(
        target,
        [`**Approval needed** — ${approval.type}`, summary].filter(Boolean).join("\n\n"),
        undefined,
        keyboard,
      );
    },

    async handleRunFailed(event) {
      // Payload shape comes from publishRunLifecyclePluginEvent in the host's
      // heartbeat service: runId, agentId, status, error, errorCode, issueId.
      const payload = (event.payload ?? {}) as {
        issueId?: unknown;
        agentId?: unknown;
        error?: unknown;
        errorCode?: unknown;
        status?: unknown;
      };

      const issueId = typeof payload.issueId === "string" ? payload.issueId : null;
      const target = (issueId ? await getChatForIssue(ctx, issueId) : null) ?? (await fallbackTarget());
      if (!target) return;

      const agentName = await describeAgent(payload.agentId);
      const detail = typeof payload.error === "string" && payload.error.trim().length > 0
        ? payload.error
        : typeof payload.errorCode === "string" && payload.errorCode.length > 0
          ? payload.errorCode
          : "no detail reported";
      const status = typeof payload.status === "string" ? payload.status : "failed";

      await send(target, `⚠️ **Run ${status}** — ${agentName}\n\n${detail}`);
    },

    async handleBudgetIncident(event) {
      const target = await fallbackTarget();
      if (!target) return;

      // Payload comes from the host's budget service: scopeType, scopeId,
      // amountObserved, amountLimit (all in billed cents), and approvalId when
      // a hard stop raised one.
      const payload = (event.payload ?? {}) as {
        scopeType?: unknown;
        amountObserved?: unknown;
        amountLimit?: unknown;
        approvalId?: unknown;
      };

      const scope = typeof payload.scopeType === "string" ? payload.scopeType : "budget";
      const spend = formatCents(payload.amountObserved);
      const limit = formatCents(payload.amountLimit);
      const amounts = spend && limit ? `\n\n${spend} of ${limit} used.` : "";
      const pending = typeof payload.approvalId === "string"
        ? "\n\nAn approval is waiting — send /pending to decide it here."
        : "";

      await send(target, `⚠️ **Budget threshold crossed** — ${scope}${amounts}${pending}`);
    },

    async handleIssueUpdated(event) {
      if (!config.relayStatusChanges || isOwnEcho(event)) return;

      const issueId = event.entityId;
      if (!issueId) return;

      // The host records the pre-update values under `_previous`, and only
      // includes `status` at all when the update touched it.
      const payload = (event.payload ?? {}) as { status?: unknown; _previous?: { status?: unknown } };
      const status = typeof payload.status === "string" ? payload.status : null;
      if (!status || status === payload._previous?.status) return;

      const target = await getChatForIssue(ctx, issueId);
      if (!target) return;

      await send(target, `Status → **${status}**`);
    },
  };
}
