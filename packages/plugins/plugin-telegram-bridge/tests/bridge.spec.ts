import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import type { Agent, Issue, PluginContext, TestHarness } from "@paperclipai/plugin-sdk";
import manifest, { PLUGIN_ID } from "../src/manifest.js";
import { createBridge, type Bridge } from "../src/bridge.js";
import { parseConfig } from "../src/config.js";
import { bindChatToIssue } from "../src/mapping.js";
import type { TelegramUpdate } from "../src/telegram.js";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const OPERATOR_USER_ID = "22222222-2222-4222-8222-222222222222";
const AGENT_ID = "33333333-3333-4333-8333-333333333333";
const ALLOWED_SENDER = 4242;
const CHAT_ID = -100999;

interface SentMessage {
  chatId: number | string;
  threadId: number | null;
  text: string;
  keyboard?: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } | null;
}

/** Captured Telegram Bot API calls, so no test touches the network. */
interface TelegramSpy {
  sent: SentMessage[];
  createdTopics: string[];
  answered: Array<{ callbackQueryId: string; text?: string }>;
  typingCalls: Array<number | null>;
  clearedKeyboards: number[];
}

function installTelegramSpy(ctx: PluginContext): TelegramSpy {
  const spy: TelegramSpy = { sent: [], createdTopics: [], answered: [], clearedKeyboards: [], typingCalls: [] };

  ctx.http.fetch = (async (url: string, init?: RequestInit) => {
    const method = url.split("/").pop() ?? "";
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

    if (method === "sendChatAction") {
      spy.typingCalls.push((body.message_thread_id as number | undefined) ?? null);
      return jsonResponse({ ok: true, result: true });
    }

    if (method === "answerCallbackQuery") {
      spy.answered.push({
        callbackQueryId: String(body.callback_query_id),
        text: body.text === undefined ? undefined : String(body.text),
      });
      return jsonResponse({ ok: true, result: true });
    }

    if (method === "editMessageReplyMarkup") {
      spy.clearedKeyboards.push(body.message_id as number);
      return jsonResponse({ ok: true, result: true });
    }

    if (method === "sendMessage") {
      spy.sent.push({
        chatId: body.chat_id as number,
        threadId: (body.message_thread_id as number | undefined) ?? null,
        text: String(body.text ?? ""),
        keyboard: body.reply_markup as SentMessage["keyboard"],
      });
      return jsonResponse({ ok: true, result: { message_id: spy.sent.length, chat: { id: CHAT_ID, type: "supergroup" }, date: 0 } });
    }

    if (method === "createForumTopic") {
      spy.createdTopics.push(String(body.name ?? ""));
      return jsonResponse({ ok: true, result: { message_thread_id: 500 + spy.createdTopics.length } });
    }

    return jsonResponse({ ok: true, result: [] });
  }) as PluginContext["http"]["fetch"];

  return spy;
}

function jsonResponse(payload: unknown): Response {
  return { json: async () => payload, status: 200 } as Response;
}

function makeAgent(): Agent {
  return {
    id: AGENT_ID,
    companyId: COMPANY_ID,
    name: "Ada",
    urlKey: "ada",
    role: "ceo",
    status: "idle",
  } as Agent;
}

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: randomUUID(),
    companyId: COMPANY_ID,
    identifier: "TEL-1",
    title: "Existing task",
    status: "in_progress",
    assigneeAgentId: AGENT_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Issue;
}

function textUpdate(text: string, overrides: Partial<TelegramUpdate["message"]> = {}): TelegramUpdate {
  return {
    update_id: Math.floor(Math.random() * 100_000),
    message: {
      message_id: 1,
      date: 0,
      text,
      from: { id: ALLOWED_SENDER },
      chat: { id: CHAT_ID, type: "supergroup", is_forum: true },
      ...overrides,
    },
  };
}

describe("Telegram bridge", () => {
  let harness: TestHarness;
  let bridge: Bridge;
  let telegram: TelegramSpy;

  beforeEach(() => {
    harness = createTestHarness({ manifest });
    harness.seed({
      agents: [makeAgent()],
      accessMembers: [
        {
          id: randomUUID(),
          companyId: COMPANY_ID,
          principalType: "user",
          principalId: OPERATOR_USER_ID,
          status: "active",
          membershipRole: "admin",
          grants: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    telegram = installTelegramSpy(harness.ctx);
    bridge = createBridge({
      ctx: harness.ctx,
      companyId: COMPANY_ID,
      config: parseConfig({
        botToken: "test-token",
        operatorUserId: OPERATOR_USER_ID,
        allowedTelegramUserIds: [ALLOWED_SENDER],
      }),
    });
  });

  describe("inbound", () => {
    it("ignores messages from senders outside the allowlist", async () => {
      await bridge.handleUpdate(textUpdate("do something", { from: { id: 9999 } }));

      expect(telegram.sent).toEqual([]);
      expect(harness.logs.some((entry) => entry.message.includes("non-allowlisted"))).toBe(true);
    });

    it("creates the standing lane on the first message and attributes it to the operator", async () => {
      await bridge.handleUpdate(textUpdate("what is our runway?"));

      const issues = await harness.ctx.issues.list({ companyId: COMPANY_ID });
      expect(issues).toHaveLength(1);
      expect(issues[0]!.assigneeAgentId).toBe(AGENT_ID);
      expect(issues[0]!.originKind).toBe(`plugin:${PLUGIN_ID}:telegram-chat`);

      const comments = await harness.ctx.issues.listComments(issues[0]!.id, COMPANY_ID);
      expect(comments).toHaveLength(1);
      // Human attribution is what makes the host wake the assignee.
      expect(comments[0]!.authorUserId).toBe(OPERATOR_USER_ID);
      expect(comments[0]!.authorType).toBe("user");
      expect(comments[0]!.body).toBe("what is our runway?");
    });

    it("reuses the standing lane for later messages in the same chat", async () => {
      await bridge.handleUpdate(textUpdate("first"));
      await bridge.handleUpdate(textUpdate("second"));

      const issues = await harness.ctx.issues.list({ companyId: COMPANY_ID });
      expect(issues).toHaveLength(1);
      expect(await harness.ctx.issues.listComments(issues[0]!.id, COMPANY_ID)).toHaveLength(2);
    });

    it("opens a forum topic and a task for /new", async () => {
      await bridge.handleUpdate(textUpdate("/new Draft the Q3 plan"));

      expect(telegram.createdTopics).toEqual(["Draft the Q3 plan"]);

      const issues = await harness.ctx.issues.list({ companyId: COMPANY_ID });
      expect(issues).toHaveLength(1);
      expect(issues[0]!.title).toBe("Draft the Q3 plan");

      // The confirmation lands in the new topic, not the originating thread.
      expect(telegram.sent[0]!.threadId).toBe(501);
    });

    it("routes later messages in a task topic to that task", async () => {
      await bridge.handleUpdate(textUpdate("/new Draft the Q3 plan"));
      const [task] = await harness.ctx.issues.list({ companyId: COMPANY_ID });

      await bridge.handleUpdate(textUpdate("add a hiring section", { message_thread_id: 501 }));

      const comments = await harness.ctx.issues.listComments(task!.id, COMPANY_ID);
      expect(comments.map((entry) => entry.body)).toContain("add a hiring section");
      // No second issue was created for the follow-up.
      expect(await harness.ctx.issues.list({ companyId: COMPANY_ID })).toHaveLength(1);
    });

    it("gives each topic its own lane so replies land in the topic you wrote in", async () => {
      await bridge.handleUpdate(textUpdate("question in topic A", { message_thread_id: 11 }));
      await bridge.handleUpdate(textUpdate("question in topic B", { message_thread_id: 22 }));

      const issues = await harness.ctx.issues.list({ companyId: COMPANY_ID });
      expect(issues).toHaveLength(2);

      // Each lane is bound back to the thread it came from, so the agent's
      // reply cannot surface in the other topic.
      for (const issue of issues) {
        const comments = await harness.ctx.issues.listComments(issue.id, COMPANY_ID);
        expect(comments).toHaveLength(1);
        const expectedThread = comments[0]!.body.includes("topic A") ? 11 : 22;

        await bridge.handleCommentCreated({
          eventId: randomUUID(),
          eventType: "issue.comment.created",
          occurredAt: new Date().toISOString(),
          actorType: "agent",
          actorId: AGENT_ID,
          entityId: issue.id,
          entityType: "issue",
          companyId: COMPANY_ID,
          payload: {
            commentId: (
              await harness.ctx.issues.createComment(issue.id, "answer", COMPANY_ID, {
                authorAgentId: AGENT_ID,
              })
            ).id,
          },
        });

        expect(telegram.sent.at(-1)!.threadId).toBe(expectedThread);
      }
    });

    it("strips the @botname suffix Telegram adds in groups", async () => {
      await bridge.handleUpdate(textUpdate("/status@my_bot"));
      // The command ran rather than falling through to "unknown command".
      expect(telegram.sent.at(-1)!.text).toContain("CEO Chat (Telegram)");
    });

    it("reopens a closed task so the comment actually wakes the assignee", async () => {
      const issue = makeIssue({ status: "done" });
      harness.seed({ issues: [issue] });
      await bindChatToIssue(harness.ctx, { chatId: CHAT_ID, threadId: 77 }, issue.id);

      await bridge.handleUpdate(textUpdate("one more thing", { message_thread_id: 77 }));

      const reloaded = await harness.ctx.issues.get(issue.id, COMPANY_ID);
      expect(reloaded!.status).toBe("todo");
      expect(await harness.ctx.issues.listComments(issue.id, COMPANY_ID)).toHaveLength(1);
    });
  });

  describe("outbound", () => {
    it("relays an agent comment to the mapped chat", async () => {
      const issue = makeIssue();
      harness.seed({ issues: [issue] });
      await bindChatToIssue(harness.ctx, { chatId: CHAT_ID, threadId: 77 }, issue.id);

      const comment = await harness.ctx.issues.createComment(
        issue.id,
        "Runway is **14 months**.",
        COMPANY_ID,
        { authorAgentId: AGENT_ID },
      );

      await bridge.handleCommentCreated({
        eventId: randomUUID(),
        eventType: "issue.comment.created",
        occurredAt: new Date().toISOString(),
        actorType: "agent",
        actorId: AGENT_ID,
        entityId: issue.id,
        entityType: "issue",
        companyId: COMPANY_ID,
        payload: { commentId: comment.id, bodySnippet: "Runway is" },
      });

      expect(telegram.sent).toHaveLength(1);
      expect(telegram.sent[0]!.threadId).toBe(77);
      // The full body is fetched back — the event only carries a snippet.
      expect(telegram.sent[0]!.text).toContain("<b>14 months</b>");
    });

    it("does not relay its own inbound comment back to Telegram", async () => {
      const issue = makeIssue();
      harness.seed({ issues: [issue] });
      await bindChatToIssue(harness.ctx, { chatId: CHAT_ID, threadId: 77 }, issue.id);

      const comment = await harness.ctx.issues.createComment(issue.id, "hello", COMPANY_ID, {
        actorUserId: OPERATOR_USER_ID,
      });

      await bridge.handleCommentCreated({
        eventId: randomUUID(),
        eventType: "issue.comment.created",
        occurredAt: new Date().toISOString(),
        actorType: "plugin",
        actorId: "plugin-row-id",
        entityId: issue.id,
        entityType: "issue",
        companyId: COMPANY_ID,
        payload: { commentId: comment.id, sourcePluginKey: PLUGIN_ID },
      });

      expect(telegram.sent).toEqual([]);
    });

    it("still relays comments written on the board by a human", async () => {
      const issue = makeIssue();
      harness.seed({ issues: [issue] });
      await bindChatToIssue(harness.ctx, { chatId: CHAT_ID, threadId: 77 }, issue.id);

      const comment = await harness.ctx.issues.createComment(issue.id, "noted", COMPANY_ID, {
        actorUserId: OPERATOR_USER_ID,
      });

      await bridge.handleCommentCreated({
        eventId: randomUUID(),
        eventType: "issue.comment.created",
        occurredAt: new Date().toISOString(),
        actorType: "user",
        actorId: OPERATOR_USER_ID,
        entityId: issue.id,
        entityType: "issue",
        companyId: COMPANY_ID,
        payload: { commentId: comment.id },
      });

      expect(telegram.sent).toHaveLength(1);
      expect(telegram.sent[0]!.text).toContain("From the board:");
    });

    it("relays a status change using the host's _previous shape", async () => {
      const issue = makeIssue();
      harness.seed({ issues: [issue] });
      await bindChatToIssue(harness.ctx, { chatId: CHAT_ID, threadId: 77 }, issue.id);

      const statusEvent = (payload: Record<string, unknown>) => ({
        eventId: randomUUID(),
        eventType: "issue.updated" as const,
        occurredAt: new Date().toISOString(),
        actorType: "agent" as const,
        actorId: AGENT_ID,
        entityId: issue.id,
        entityType: "issue",
        companyId: COMPANY_ID,
        payload,
      });

      await bridge.handleIssueUpdated(statusEvent({ status: "done", _previous: { status: "in_progress" } }));
      expect(telegram.sent.at(-1)!.text).toContain("done");

      // An update that did not touch the status must stay quiet.
      telegram.sent.length = 0;
      await bridge.handleIssueUpdated(statusEvent({ title: "Renamed" }));
      await bridge.handleIssueUpdated(statusEvent({ status: "done", _previous: { status: "done" } }));
      expect(telegram.sent).toEqual([]);
    });

    it("ignores comments on issues that are not mapped to a chat", async () => {
      const issue = makeIssue();
      harness.seed({ issues: [issue] });

      const comment = await harness.ctx.issues.createComment(issue.id, "internal", COMPANY_ID, {
        authorAgentId: AGENT_ID,
      });

      await bridge.handleCommentCreated({
        eventId: randomUUID(),
        eventType: "issue.comment.created",
        occurredAt: new Date().toISOString(),
        actorType: "agent",
        actorId: AGENT_ID,
        entityId: issue.id,
        entityType: "issue",
        companyId: COMPANY_ID,
        payload: { commentId: comment.id },
      });

      expect(telegram.sent).toEqual([]);
    });
  });
});

describe("Telegram bridge — decisions and alerts", () => {
  let harness: TestHarness;
  let bridge: Bridge;
  let telegram: TelegramSpy;

  const APPROVAL_ID = "55555555-5555-4555-8555-555555555555";

  beforeEach(() => {
    harness = createTestHarness({ manifest });
    harness.seed({
      agents: [makeAgent()],
      accessMembers: [
        {
          id: randomUUID(),
          companyId: COMPANY_ID,
          principalType: "user",
          principalId: OPERATOR_USER_ID,
          status: "active",
          membershipRole: "admin",
          grants: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      approvals: [
        {
          id: APPROVAL_ID,
          companyId: COMPANY_ID,
          type: "budget_override_required",
          requestedByAgentId: AGENT_ID,
          requestedByUserId: null,
          status: "pending",
          payload: { summary: "Raise the ad budget to $500" },
          decisionNote: null,
          decidedByUserId: null,
          decidedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    telegram = installTelegramSpy(harness.ctx);
    bridge = createBridge({
      ctx: harness.ctx,
      companyId: COMPANY_ID,
      config: parseConfig({
        botToken: "test-token",
        operatorUserId: OPERATOR_USER_ID,
        allowedTelegramUserIds: [ALLOWED_SENDER],
        notificationChatId: CHAT_ID,
      }),
    });
  });

  function approvalEvent() {
    return {
      eventId: randomUUID(),
      eventType: "approval.created" as const,
      occurredAt: new Date().toISOString(),
      actorType: "agent" as const,
      actorId: AGENT_ID,
      entityId: APPROVAL_ID,
      entityType: "approval",
      companyId: COMPANY_ID,
      payload: {},
    };
  }

  function callbackUpdate(data: string, senderId = ALLOWED_SENDER): TelegramUpdate {
    return {
      update_id: Math.floor(Math.random() * 100_000),
      callback_query: {
        id: "cb-1",
        from: { id: senderId },
        data,
        message: {
          message_id: 900,
          date: 0,
          chat: { id: CHAT_ID, type: "supergroup", is_forum: true },
        },
      },
    };
  }

  /** Pull the callback_data off the last message that carried buttons. */
  function lastCallbackData(action: "a" | "r"): string {
    const withButtons = [...telegram.sent].reverse().find((entry) => entry.keyboard);
    const buttons = withButtons?.keyboard?.inline_keyboard[0] ?? [];
    const button = buttons.find((entry) => entry.callback_data.endsWith(`:${action}`));
    if (!button) throw new Error("no decision button was sent");
    return button.callback_data;
  }

  it("sends an approval with Approve/Reject buttons", async () => {
    await bridge.handleApprovalCreated(approvalEvent());

    expect(telegram.sent).toHaveLength(1);
    expect(telegram.sent[0]!.text).toContain("Raise the ad budget");
    expect(telegram.sent[0]!.keyboard!.inline_keyboard[0]).toHaveLength(2);
  });

  it("applies a tapped approval as the operator and clears the buttons", async () => {
    await bridge.handleApprovalCreated(approvalEvent());
    await bridge.handleUpdate(callbackUpdate(lastCallbackData("a")));

    const approval = await harness.ctx.approvals.get(APPROVAL_ID, COMPANY_ID);
    expect(approval!.status).toBe("approved");
    // Attribution is the operator, never the plugin.
    expect(approval!.decidedByUserId).toBe(OPERATOR_USER_ID);
    expect(telegram.answered.at(-1)!.text).toContain("approved");
    expect(telegram.clearedKeyboards).toContain(900);
  });

  it("rejects an approval when the reject button is tapped", async () => {
    await bridge.handleApprovalCreated(approvalEvent());
    await bridge.handleUpdate(callbackUpdate(lastCallbackData("r")));

    expect((await harness.ctx.approvals.get(APPROVAL_ID, COMPANY_ID))!.status).toBe("rejected");
  });

  it("ignores a second tap on the same button", async () => {
    await bridge.handleApprovalCreated(approvalEvent());
    const data = lastCallbackData("a");

    await bridge.handleUpdate(callbackUpdate(data));
    await bridge.handleUpdate(callbackUpdate(data));

    // Still approved (not flipped), and the repeat tap was told so.
    expect((await harness.ctx.approvals.get(APPROVAL_ID, COMPANY_ID))!.status).toBe("approved");
    expect(telegram.answered.at(-1)!.text).toContain("already handled");
  });

  it("refuses a button tap from outside the allowlist", async () => {
    await bridge.handleApprovalCreated(approvalEvent());
    await bridge.handleUpdate(callbackUpdate(lastCallbackData("a"), 9999));

    expect((await harness.ctx.approvals.get(APPROVAL_ID, COMPANY_ID))!.status).toBe("pending");
    expect(telegram.answered.at(-1)!.text).toContain("Not authorized");
  });

  it("ignores callback data that does not decode to a stored decision", async () => {
    await bridge.handleUpdate(callbackUpdate("d:ffffffffffff:a"));

    expect((await harness.ctx.approvals.get(APPROVAL_ID, COMPANY_ID))!.status).toBe("pending");
    expect(telegram.answered.at(-1)!.text).toContain("already handled");
  });

  it("relays a budget stop to the configured notification chat", async () => {
    await bridge.handleBudgetIncident({
      eventId: randomUUID(),
      eventType: "budget.incident.opened",
      occurredAt: new Date().toISOString(),
      actorType: "system",
      actorId: "system",
      entityId: randomUUID(),
      entityType: "budget_incident",
      companyId: COMPANY_ID,
      // Real host payload: scopeType/scopeId plus billed cents.
      payload: { scopeType: "agent", scopeId: AGENT_ID, amountObserved: 52_000, amountLimit: 50_000 },
    });

    expect(telegram.sent).toHaveLength(1);
    expect(telegram.sent[0]!.chatId).toBe(CHAT_ID);
    expect(telegram.sent[0]!.text).toContain("agent");
    expect(telegram.sent[0]!.text).toContain("$520.00 of $500.00 used");
  });

  it("marks an edited message so the agent knows the wording changed", async () => {
    await bridge.handleUpdate({
      update_id: 1,
      edited_message: {
        message_id: 5,
        date: 0,
        edit_date: 1,
        text: "actually, make it Q4",
        from: { id: ALLOWED_SENDER },
        chat: { id: CHAT_ID, type: "supergroup", is_forum: true },
      },
    });

    const [issue] = await harness.ctx.issues.list({ companyId: COMPANY_ID });
    const comments = await harness.ctx.issues.listComments(issue!.id, COMPANY_ID);
    expect(comments[0]!.body).toContain("(edited message)");
    expect(comments[0]!.body).toContain("actually, make it Q4");
  });

  it("records a photo in the thread rather than dropping the message", async () => {
    await bridge.handleUpdate({
      update_id: 2,
      message: {
        message_id: 6,
        date: 0,
        caption: "the mockup",
        photo: [{ file_id: "abc", width: 100, height: 100 }],
        from: { id: ALLOWED_SENDER },
        chat: { id: CHAT_ID, type: "supergroup", is_forum: true },
      },
    });

    const [issue] = await harness.ctx.issues.list({ companyId: COMPANY_ID });
    const comments = await harness.ctx.issues.listComments(issue!.id, COMPANY_ID);
    expect(comments[0]!.body).toContain("[photo sent in Telegram]");
    expect(comments[0]!.body).toContain("the mockup");
  });

  it("does not treat a slash inside an edited message as a command", async () => {
    await bridge.handleUpdate({
      update_id: 3,
      edited_message: {
        message_id: 7,
        date: 0,
        edit_date: 1,
        text: "/done was a typo, keep it open",
        from: { id: ALLOWED_SENDER },
        chat: { id: CHAT_ID, type: "supergroup", is_forum: true },
      },
    });

    const [issue] = await harness.ctx.issues.list({ companyId: COMPANY_ID });
    expect(issue!.status).not.toBe("done");
  });
});

describe("Telegram bridge — thread interactions", () => {
  let harness: TestHarness;
  let bridge: Bridge;
  let telegram: TelegramSpy;
  let issue: Issue;

  const INTERACTION_ID = "66666666-6666-4666-8666-666666666666";

  beforeEach(async () => {
    harness = createTestHarness({ manifest });
    issue = makeIssue();
    harness.seed({
      agents: [makeAgent()],
      issues: [issue],
      accessMembers: [
        {
          id: randomUUID(),
          companyId: COMPANY_ID,
          principalType: "user",
          principalId: OPERATOR_USER_ID,
          status: "active",
          membershipRole: "admin",
          grants: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      issueInteractions: [
        {
          id: INTERACTION_ID,
          companyId: COMPANY_ID,
          issueId: issue.id,
          kind: "request_confirmation",
          status: "pending",
          title: "Ship the pricing page?",
          summary: "The copy is final and staging looks right.",
          continuationPolicy: "resume",
          resolverPolicy: "board_only",
          requestedResolverPolicy: "board_only",
          effectiveResolverPolicy: "board_only",
          payload: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        } as never,
      ],
    });

    telegram = installTelegramSpy(harness.ctx);
    bridge = createBridge({
      ctx: harness.ctx,
      companyId: COMPANY_ID,
      config: parseConfig({
        botToken: "test-token",
        operatorUserId: OPERATOR_USER_ID,
        allowedTelegramUserIds: [ALLOWED_SENDER],
      }),
    });

    await bindChatToIssue(harness.ctx, { chatId: CHAT_ID, threadId: 77 }, issue.id);
  });

  async function relayAgentComment(body: string) {
    const comment = await harness.ctx.issues.createComment(issue.id, body, COMPANY_ID, {
      authorAgentId: AGENT_ID,
    });
    await bridge.handleCommentCreated({
      eventId: randomUUID(),
      eventType: "issue.comment.created",
      occurredAt: new Date().toISOString(),
      actorType: "agent",
      actorId: AGENT_ID,
      entityId: issue.id,
      entityType: "issue",
      companyId: COMPANY_ID,
      payload: { commentId: comment.id },
    });
  }

  it("surfaces a pending confirmation as buttons alongside the comment", async () => {
    await relayAgentComment("Staging is green.");

    expect(telegram.sent).toHaveLength(2);
    expect(telegram.sent[1]!.text).toContain("Ship the pricing page?");
    expect(telegram.sent[1]!.keyboard!.inline_keyboard[0]).toHaveLength(2);
  });

  it("announces the same interaction only once", async () => {
    await relayAgentComment("Staging is green.");
    await relayAgentComment("Still waiting on you.");

    // Two comments relayed, but only the first carried the decision card.
    const withButtons = telegram.sent.filter((entry) => entry.keyboard);
    expect(withButtons).toHaveLength(1);
  });

  it("resolves the interaction as the operator when a button is tapped", async () => {
    await relayAgentComment("Staging is green.");

    const button = telegram.sent
      .find((entry) => entry.keyboard)!
      .keyboard!.inline_keyboard[0]!
      .find((entry) => entry.callback_data.endsWith(":a"))!;

    await bridge.handleUpdate({
      update_id: 10,
      callback_query: {
        id: "cb-2",
        from: { id: ALLOWED_SENDER },
        data: button.callback_data,
        message: { message_id: 901, date: 0, chat: { id: CHAT_ID, type: "supergroup" } },
      },
    });

    const [interaction] = await harness.ctx.issues.listInteractions(issue.id, COMPANY_ID);
    expect(interaction!.status).toBe("accepted");
    expect(telegram.answered.at(-1)!.text).toContain("Approved");
  });
});

describe("Telegram bridge — typing indicator and lane reuse", () => {
  let harness: TestHarness;
  let bridge: Bridge;
  let telegram: TelegramSpy;

  beforeEach(() => {
    harness = createTestHarness({ manifest });
    harness.seed({
      agents: [makeAgent()],
      accessMembers: [
        {
          id: randomUUID(),
          companyId: COMPANY_ID,
          principalType: "user",
          principalId: OPERATOR_USER_ID,
          status: "active",
          membershipRole: "admin",
          grants: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    telegram = installTelegramSpy(harness.ctx);
    bridge = createBridge({
      ctx: harness.ctx,
      companyId: COMPANY_ID,
      config: parseConfig({
        botToken: "test-token",
        operatorUserId: OPERATOR_USER_ID,
        allowedTelegramUserIds: [ALLOWED_SENDER],
      }),
    });
  });

  function runEvent(type: "agent.run.started" | "agent.run.finished", issueId: string, runId: string) {
    return {
      eventId: randomUUID(),
      eventType: type,
      occurredAt: new Date().toISOString(),
      actorType: "agent" as const,
      actorId: AGENT_ID,
      entityId: runId,
      entityType: "heartbeat_run",
      companyId: COMPANY_ID,
      payload: { runId, agentId: AGENT_ID, issueId },
    };
  }

  it("types in the thread while a run on a mapped issue is open", async () => {
    const issue = makeIssue();
    harness.seed({ issues: [issue] });
    await bindChatToIssue(harness.ctx, { chatId: CHAT_ID, threadId: 77 }, issue.id);

    await bridge.handleRunStarted(runEvent("agent.run.started", issue.id, "run-1"));
    // The first tick fires immediately so the indicator is not delayed.
    expect(telegram.typingCalls).toEqual([77]);

    await bridge.handleRunEnded(runEvent("agent.run.finished", issue.id, "run-1"));
    const afterStop = telegram.typingCalls.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(telegram.typingCalls.length).toBe(afterStop);
  });

  it("does not type for runs on issues that are not mapped to a chat", async () => {
    const issue = makeIssue();
    harness.seed({ issues: [issue] });

    await bridge.handleRunStarted(runEvent("agent.run.started", issue.id, "run-2"));
    expect(telegram.typingCalls).toEqual([]);
  });

  it("reopens a closed standing lane instead of creating a second one", async () => {
    await bridge.handleUpdate(textUpdate("first question"));
    const [lane] = await harness.ctx.issues.list({ companyId: COMPANY_ID });

    // The agent closes the lane, which is what the host's disposition rules
    // push it towards. The next message must land back in the same thread.
    await harness.ctx.issues.update(lane!.id, { status: "done" }, COMPANY_ID);
    await bridge.handleUpdate(textUpdate("second question"));

    const issues = await harness.ctx.issues.list({ companyId: COMPANY_ID });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.id).toBe(lane!.id);
    expect(issues[0]!.status).toBe("todo");
    expect(await harness.ctx.issues.listComments(lane!.id, COMPANY_ID)).toHaveLength(2);
  });
});
