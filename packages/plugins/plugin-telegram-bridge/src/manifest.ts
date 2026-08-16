import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

/**
 * Stable plugin ID used by host registration, event namespacing, and the
 * `plugin:<key>` issue origin this bridge stamps on the issues it creates.
 */
export const PLUGIN_ID = "paperclip.telegram-bridge";
export const PLUGIN_VERSION = "0.1.0";

/** Webhook endpoint key. Route: `POST /api/plugins/:pluginId/webhooks/telegram`. */
export const WEBHOOK_ENDPOINT_KEY = "telegram";

/**
 * Telegram ↔ Paperclip chat bridge.
 *
 * Every conversation is an issue thread: inbound Telegram messages become
 * human-attributed issue comments (which wake the assigned agent exactly the
 * way a board comment does), and the agent's comments are relayed back to the
 * originating Telegram chat or forum topic.
 */
const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Telegram Bridge",
  description:
    "Chat with a Paperclip agent from Telegram. Each Telegram topic maps to an issue thread; your replies wake the assignee and the agent's comments come back to the chat.",
  author: "Paperclip",
  categories: ["connector"],
  capabilities: [
    // Read the target agent and resolve it by role when no id is configured.
    "agents.read",
    // Issue thread lifecycle for the chat lanes.
    "issues.read",
    "issues.create",
    "issues.update",
    "issues.wakeup",
    "issue.comments.read",
    "issue.comments.create",
    // Relay *your* Telegram messages as your own Paperclip identity rather
    // than as the plugin. This is what makes an inbound message wake the
    // assigned agent — a plugin-attributed comment never does.
    "issue.comments.create_human_attributed",
    // Decision cards (confirmations, task suggestions) surfaced as buttons.
    "issue.interactions.read",
    "issue.interactions.respond",
    // Approvals surfaced as buttons. Decisions are attributed to the operator
    // and re-verified host-side, exactly like the human-attributed comments.
    "approvals.read",
    "approvals.respond",
    // Outbound relay is driven by issue.comment.created / issue.updated.
    "events.subscribe",
    // Telegram Bot API calls.
    "http.outbound",
    // Bot token and webhook secret are stored as secret refs, never inline.
    "secrets.read-ref",
    // Chat ↔ issue mapping and the long-poll update offset.
    "plugin.state.read",
    "plugin.state.write",
    // Only used in webhook mode; harmless when polling.
    "webhooks.receive",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  webhooks: [
    {
      endpointKey: WEBHOOK_ENDPOINT_KEY,
      displayName: "Telegram updates",
      description:
        "Receives Telegram Bot API updates when transport is set to 'webhook'. Verifies the X-Telegram-Bot-Api-Secret-Token header.",
    },
  ],
  instanceConfigSchema: {
    type: "object",
    required: ["botToken", "operatorUserId", "allowedTelegramUserIds"],
    properties: {
      botToken: {
        // "secret-ref" makes the settings UI render a company-secret picker
        // instead of a plain text box. That picker stores a bound secret as an
        // object ({ type: "secret_ref", secretId }) and a pasted value as a
        // plain string, so the schema has to accept both — declaring only
        // "string" makes the host reject every picked secret.
        title: "Bot token",
        description:
          "Telegram bot token from @BotFather. Pick an existing secret, or paste the token once and it is stored as a secret on save.",
        type: ["string", "object"],
        format: "secret-ref",
      },
      transport: {
        title: "Transport",
        description:
          "How Telegram updates reach Paperclip. 'polling' needs no public URL and is the right default for a self-hosted instance.",
        type: "string",
        enum: ["polling", "webhook"],
        default: "polling",
      },
      webhookSecretToken: {
        title: "Webhook secret token",
        description:
          "Only used when transport is 'webhook'. Must match the secret_token passed to Telegram's setWebhook.",
        type: ["string", "object"],
        format: "secret-ref",
      },
      agentId: {
        title: "Agent ID",
        description:
          "Agent that owns the chat threads. Leave empty to resolve by role instead.",
        type: "string",
      },
      agentRole: {
        title: "Agent role",
        description:
          "Used when no agent ID is set: the first non-terminated agent with this role becomes the chat partner.",
        type: "string",
        enum: [
          "ceo",
          "cto",
          "cmo",
          "cfo",
          "security",
          "engineer",
          "designer",
          "pm",
          "qa",
          "devops",
          "researcher",
          "general",
        ],
        default: "ceo",
      },
      operatorUserId: {
        title: "Paperclip user ID",
        description:
          "Active human company member that inbound Telegram messages are attributed to. The host rejects any other identity.",
        type: "string",
      },
      allowedTelegramUserIds: {
        title: "Allowed Telegram user IDs",
        description:
          "Numeric Telegram user IDs allowed to drive the agent. Messages from anyone else are ignored. Never leave this empty.",
        type: "array",
        items: { type: "number" },
        default: [],
      },
      projectId: {
        title: "Project ID",
        description: "Optional project that new issues are filed under.",
        type: "string",
      },
      standingChatTitle: {
        title: "Standing chat title",
        description:
          "Title of the always-on conversation lane created per Telegram chat, used for messages that are not tied to a task.",
        type: "string",
        default: "CEO Chat (Telegram)",
      },
      relayStatusChanges: {
        title: "Relay status changes",
        description: "Post a short note in the chat when a mapped issue changes status.",
        type: "boolean",
        default: true,
      },
      relayApprovals: {
        title: "Relay approvals",
        description:
          "Send pending approvals to Telegram with Approve/Reject buttons. Decisions are attributed to the Paperclip user above.",
        type: "boolean",
        default: true,
      },
      relayAlerts: {
        title: "Relay failures and budget stops",
        description: "Notify on failed agent runs and budget incidents.",
        type: "boolean",
        default: true,
      },
      notificationChatId: {
        title: "Notification chat ID",
        description:
          "Where alerts that are not tied to a task go. Leave empty to use the last chat you spoke in.",
        type: "number",
      },
      notificationThreadId: {
        title: "Notification topic ID",
        description: "Optional forum topic within the notification chat.",
        type: "number",
      },
    },
  },
};

export default manifest;
