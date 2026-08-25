import type { EnvSecretRefBinding, PluginContext } from "@paperclipai/plugin-sdk";
import { normalizeAllowlistEntry, parseAddress } from "./recipients.js";

/**
 * Operator configuration after normalization. The password keeps its raw
 * binding shape here — it is resolved through `ctx.secrets` at send time and
 * never cached (see `resolvePassword`).
 */
export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  password: string | EnvSecretRefBinding | null;
  rejectUnauthorized: boolean;
  fromAddress: string;
  fromName: string;
  replyToAddress: string;
  bccAddress: string | null;
  /** When true, allows sending to any recipient without checking allowedRecipients. */
  allowAnyRecipient: boolean;
  /** Normalized allowlist: exact addresses and `@domain` entries, lowercased. */
  allowedRecipients: string[];
  subjectPrefix: string | null;
  /** Optional custom HTML template containing `{{body}}` or `[body]` */
  htmlTemplate: string | null;
  maxPerHour: number;
  maxPerDay: number;
}

export const DEFAULT_PORT = 587;
export const DEFAULT_FROM_NAME = "Paperclip";
export const DEFAULT_MAX_PER_HOUR = 20;
export const DEFAULT_MAX_PER_DAY = 100;

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
 * Ports and limits arrive as numbers from the settings form, but operators
 * paste them as strings often enough that rejecting a string here would look
 * like the field simply does not work.
 */
function readPositiveInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(readString(value) ?? Number.NaN);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

/** Normalize a raw config row into the shape the worker uses. */
export function parseConfig(raw: Record<string, unknown>): EmailConfig {
  const rawAllowlist = Array.isArray(raw.allowedRecipients) ? raw.allowedRecipients : [];
  const allowedRecipients: string[] = [];
  for (const entry of rawAllowlist) {
    const normalized = normalizeAllowlistEntry(entry);
    if (normalized && !allowedRecipients.includes(normalized)) allowedRecipients.push(normalized);
  }

  return {
    host: readString(raw.host) ?? "",
    port: readPositiveInteger(raw.port, DEFAULT_PORT),
    secure: raw.secure === true,
    username: readString(raw.username),
    password: readSecretField(raw.password),
    // Only an explicit false turns verification off, so a missing field or a
    // typo leaves the safe behavior in place.
    rejectUnauthorized: raw.rejectUnauthorized !== false,
    fromAddress: parseAddress(raw.fromAddress) ?? "",
    fromName: readString(raw.fromName) ?? DEFAULT_FROM_NAME,
    replyToAddress: parseAddress(raw.replyToAddress) ?? "",
    bccAddress: parseAddress(raw.bccAddress),
    allowAnyRecipient: raw.allowAnyRecipient === true,
    allowedRecipients,
    subjectPrefix: readString(raw.subjectPrefix),
    htmlTemplate: readString(raw.htmlTemplate),
    maxPerHour: readPositiveInteger(raw.maxPerHour, DEFAULT_MAX_PER_HOUR),
    maxPerDay: readPositiveInteger(raw.maxPerDay, DEFAULT_MAX_PER_DAY),
  };
}

export interface ConfigValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate an operator config without touching the network. Surfaced through
 * `onValidateConfig` so the settings UI rejects a half-configured sender before
 * an agent discovers the tool and starts failing mid-run.
 */
export function validateConfig(raw: Record<string, unknown>): ConfigValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const config = parseConfig(raw);

  if (!config.host) {
    errors.push("host is required — the hostname of your SMTP server.");
  }
  if (!config.fromAddress) {
    errors.push("fromAddress is required and must be a plain email address.");
  }
  if (!config.replyToAddress) {
    errors.push("replyToAddress is required and must be a plain email address.");
  }
  if (raw.bccAddress != null && typeof raw.bccAddress === "string" && raw.bccAddress.trim().length > 0 && !config.bccAddress) {
    errors.push("bccAddress must be a valid email address.");
  }

  if (config.password == null) {
    // Not an error: an internal relay may authenticate by IP.
    warnings.push(
      "No SMTP password is set. This only works with a relay that authenticates by IP address.",
    );
  } else if (typeof config.password === "string") {
    warnings.push(
      "password is stored as a literal string. Bind a secret reference instead so the password is not readable from the plugin config row.",
    );
  }
  if (config.password != null && !config.username) {
    warnings.push("A password is set but username is empty; most servers reject that combination.");
  }

  const rawAllowlist = Array.isArray(raw.allowedRecipients) ? raw.allowedRecipients : [];
  const invalid = rawAllowlist.filter((entry) => normalizeAllowlistEntry(entry) == null);
  if (invalid.length > 0) {
    errors.push(
      `allowedRecipients contains entries that are neither an address nor an @domain: ${invalid
        .map((entry) => String(entry))
        .join(", ")}`,
    );
  }
  if (!config.allowAnyRecipient && config.allowedRecipients.length === 0) {
    // Fail closed rather than warn when allowAnyRecipient is false.
    errors.push(
      "allowedRecipients is empty — every send would be rejected. Add at least one address or @domain, or enable 'Allow any recipient'.",
    );
  }
  if (config.allowAnyRecipient && !config.bccAddress) {
    warnings.push(
      "Allow any recipient is enabled without a BCC copy address configured. Setting a BCC address is recommended for auditing outbound emails.",
    );
  }

  if (config.htmlTemplate) {
    const hasBodyPlaceholder =
      config.htmlTemplate.includes("{{body}}") || config.htmlTemplate.includes("[body]");
    if (!hasBodyPlaceholder) {
      errors.push(
        "htmlTemplate must contain {{body}} or [body] where the email content will be inserted.",
      );
    }
  }

  if (!config.secure && config.port === 465) {
    warnings.push("Port 465 normally needs implicit TLS. Turn on 'Implicit TLS' or switch to port 587.");
  }
  if (config.secure && config.port === 587) {
    warnings.push("Port 587 normally uses STARTTLS. Turn off 'Implicit TLS' or switch to port 465.");
  }
  if (!config.rejectUnauthorized) {
    warnings.push(
      "TLS certificate verification is off. The connection is encrypted but unauthenticated — anyone who can intercept it can read the password.",
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Resolve the SMTP password at call time. Never cache the result: secret
 * values must not outlive the call that needed them.
 */
export async function resolvePassword(
  ctx: PluginContext,
  config: EmailConfig,
  companyId: string,
): Promise<string | null> {
  if (config.password == null) return null;
  if (isSecretRef(config.password)) {
    return await ctx.secrets.resolve(config.password, { companyId, configPath: "password" });
  }
  return config.password;
}
