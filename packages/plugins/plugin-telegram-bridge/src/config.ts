import type { EnvSecretRefBinding, PluginContext } from "@paperclipai/plugin-sdk";

/**
 * Operator configuration after normalization. Secret-bearing fields keep their
 * raw binding shape here — they are resolved through `ctx.secrets` at call
 * time and never cached (see `resolveBotToken`).
 */
export interface BridgeConfig {
  botToken: string | EnvSecretRefBinding;
  transport: "polling" | "webhook";
  webhookSecretToken: string | EnvSecretRefBinding | null;
  agentId: string | null;
  agentRole: string;
  operatorUserId: string;
  allowedTelegramUserIds: number[];
  projectId: string | null;
  standingChatTitle: string;
  relayStatusChanges: boolean;
  relayApprovals: boolean;
  relayAlerts: boolean;
  /** Chat for notifications not tied to a mapped issue. Null = last active chat. */
  notificationChatId: number | null;
  notificationThreadId: number | null;
}

export const DEFAULT_AGENT_ROLE = "ceo";
export const DEFAULT_STANDING_CHAT_TITLE = "CEO Chat (Telegram)";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * A secret-bearing field is either a bound `secret_ref` object or a literal
 * string. Both are accepted; only the ref shape keeps the value out of the
 * config row.
 */
export function isSecretRef(value: unknown): value is EnvSecretRefBinding {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && (value as { type?: unknown }).type === "secret_ref"
    && typeof (value as { secretId?: unknown }).secretId === "string"
  );
}

function readSecretField(value: unknown): string | EnvSecretRefBinding | null {
  if (isSecretRef(value)) return value;
  return readString(value);
}

/**
 * Telegram user IDs arrive as numbers, but operators routinely paste them as
 * strings from @userinfobot. Accept both and reject anything that is not a
 * positive integer, so a typo fails loudly at validation instead of silently
 * whitelisting nobody.
 */
function readTelegramUserIds(value: unknown): { ids: number[]; invalid: string[] } {
  if (!Array.isArray(value)) return { ids: [], invalid: [] };
  const ids: number[] = [];
  const invalid: string[] = [];
  for (const entry of value) {
    const parsed = typeof entry === "number" ? entry : Number(readString(entry) ?? Number.NaN);
    if (Number.isSafeInteger(parsed) && parsed > 0) ids.push(parsed);
    else invalid.push(String(entry));
  }
  return { ids, invalid };
}

/**
 * Chat and topic ids are signed integers in Telegram (group ids are negative),
 * and operators paste them as strings just as often as numbers.
 */
function readInteger(value: unknown): number | null {
  if (typeof value === "number") return Number.isSafeInteger(value) ? value : null;
  const text = readString(value);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/** Normalize a raw config row into the shape the worker uses. */
export function parseConfig(raw: Record<string, unknown>): BridgeConfig {
  const transport = readString(raw.transport) === "webhook" ? "webhook" : "polling";
  return {
    botToken: readSecretField(raw.botToken) ?? "",
    transport,
    webhookSecretToken: readSecretField(raw.webhookSecretToken),
    agentId: readString(raw.agentId),
    agentRole: readString(raw.agentRole) ?? DEFAULT_AGENT_ROLE,
    operatorUserId: readString(raw.operatorUserId) ?? "",
    allowedTelegramUserIds: readTelegramUserIds(raw.allowedTelegramUserIds).ids,
    projectId: readString(raw.projectId),
    standingChatTitle: readString(raw.standingChatTitle) ?? DEFAULT_STANDING_CHAT_TITLE,
    relayStatusChanges: raw.relayStatusChanges !== false,
    relayApprovals: raw.relayApprovals !== false,
    relayAlerts: raw.relayAlerts !== false,
    notificationChatId: readInteger(raw.notificationChatId),
    notificationThreadId: readInteger(raw.notificationThreadId),
  };
}

export interface ConfigValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate an operator config without touching the network. Surfaced through
 * `onValidateConfig` so the settings UI can reject a half-configured bridge
 * before it starts relaying anything.
 */
export function validateConfig(raw: Record<string, unknown>): ConfigValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const config = parseConfig(raw);

  if (!config.botToken) {
    errors.push("botToken is required — bind the @BotFather token as a secret reference.");
  } else if (typeof config.botToken === "string") {
    warnings.push(
      "botToken is stored as a literal string. Bind a secret reference instead so the token is not readable from the plugin config row.",
    );
  }

  if (!config.operatorUserId) {
    errors.push(
      "operatorUserId is required — inbound Telegram messages are attributed to this Paperclip user.",
    );
  }

  const { invalid } = readTelegramUserIds(raw.allowedTelegramUserIds);
  if (invalid.length > 0) {
    errors.push(`allowedTelegramUserIds contains non-numeric entries: ${invalid.join(", ")}`);
  }
  if (config.allowedTelegramUserIds.length === 0) {
    // Fail closed rather than warn: an empty allowlist with a live bot token
    // means anyone who finds the bot can spend the agent's budget.
    errors.push(
      "allowedTelegramUserIds is empty — every inbound message would be ignored. Add your own Telegram user ID.",
    );
  }

  if (config.transport === "webhook" && !config.webhookSecretToken) {
    errors.push(
      "webhookSecretToken is required when transport is 'webhook' — it authenticates Telegram against the public webhook route.",
    );
  }
  if (config.transport === "polling" && config.webhookSecretToken) {
    warnings.push("webhookSecretToken is set but transport is 'polling'; it will be ignored.");
  }

  if (!config.agentId && !config.agentRole) {
    errors.push("Set either agentId or agentRole so the bridge knows which agent to talk to.");
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Resolve the bot token at call time. Never cache the result: secret values
 * must not outlive the call that needed them.
 */
export async function resolveBotToken(ctx: PluginContext, config: BridgeConfig, companyId: string) {
  if (isSecretRef(config.botToken)) {
    return await ctx.secrets.resolve(config.botToken, { companyId, configPath: "botToken" });
  }
  return config.botToken;
}

/** Resolve the webhook secret token at call time. Returns null when unset. */
export async function resolveWebhookSecret(
  ctx: PluginContext,
  config: BridgeConfig,
  companyId: string,
) {
  if (!config.webhookSecretToken) return null;
  if (isSecretRef(config.webhookSecretToken)) {
    return await ctx.secrets.resolve(config.webhookSecretToken, {
      companyId,
      configPath: "webhookSecretToken",
    });
  }
  return config.webhookSecretToken;
}
