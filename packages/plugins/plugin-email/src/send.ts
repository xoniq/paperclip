import type { PluginContext } from "@paperclipai/plugin-sdk";
import type { EmailConfig } from "./config.js";
import { resolvePassword } from "./config.js";
import { markdownToHtml, wrapEmailHtml } from "./markdown.js";
import { formatFrom, resolveRecipients, sanitizeSubject } from "./recipients.js";
import {
  createNodemailerTransport,
  describeSmtpError,
  transportOptionsFor,
  type SmtpAttachment,
  type SmtpTransportFactory,
} from "./smtp.js";
import { appendSendLog, computeBudget, readSendLog } from "./state.js";

/** Ceilings applied before anything touches the network. */
export const MAX_SUBJECT_CHARS = 200;
export const MAX_BODY_CHARS = 100_000;
export const MAX_RECIPIENTS = 20;
export const MAX_ATTACHMENTS = 5;
/** Total decoded attachment bytes. Most servers refuse well before this. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export interface SendEmailRequest {
  to?: unknown;
  cc?: unknown;
  subject?: unknown;
  body?: unknown;
  attachments?: unknown;
}

export interface SendEmailOutcome {
  ok: boolean;
  /** Operator/agent-readable failure reason. Present when ok is false. */
  error?: string;
  messageId?: string;
  /** Addresses the send was actually attempted for. */
  recipients?: string[];
  /** Addresses the server refused. */
  rejected?: string[];
}

export interface SendEmailInput {
  ctx: PluginContext;
  companyId: string;
  config: EmailConfig;
  request: SendEmailRequest;
  source: "agent" | "test";
  agentId?: string;
  runId?: string;
  /** Injectable for tests; defaults to the real nodemailer transport. */
  transportFactory?: SmtpTransportFactory;
  /** Injectable for tests; defaults to Date.now(). */
  now?: number;
}

interface PreparedAttachments {
  attachments: SmtpAttachment[];
  error?: string;
}

/**
 * Decode and bound the attachment list.
 *
 * The filename is scrubbed rather than rejected — a model-generated filename
 * with a slash in it is a nuisance, not an attack signal — but a filename that
 * scrubs down to nothing is refused, because an attachment nobody can name is
 * an attachment nobody can trust.
 */
function prepareAttachments(raw: unknown): PreparedAttachments {
  if (raw == null) return { attachments: [] };
  if (!Array.isArray(raw)) return { attachments: [], error: "attachments must be an array" };
  if (raw.length > MAX_ATTACHMENTS) {
    return { attachments: [], error: `at most ${MAX_ATTACHMENTS} attachments are allowed` };
  }

  const attachments: SmtpAttachment[] = [];
  let totalBytes = 0;

  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) {
      return { attachments: [], error: "each attachment must be an object" };
    }
    const item = entry as { filename?: unknown; contentBase64?: unknown; contentType?: unknown };

    const filename = typeof item.filename === "string"
      ? item.filename.replace(/[/\\]/g, "-").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200)
      : "";
    if (filename.length === 0) {
      return { attachments: [], error: "each attachment needs a filename" };
    }
    if (typeof item.contentBase64 !== "string" || item.contentBase64.length === 0) {
      return { attachments: [], error: `attachment ${filename} has no contentBase64` };
    }

    // Node's base64 decoder silently drops invalid characters, so a corrupted
    // payload would arrive as a plausible-looking short file. Re-encoding and
    // comparing is the cheap way to notice.
    const normalized = item.contentBase64.replace(/\s/g, "");
    const content = Buffer.from(normalized, "base64");
    if (content.toString("base64").replace(/=+$/, "") !== normalized.replace(/=+$/, "")) {
      return { attachments: [], error: `attachment ${filename} is not valid base64` };
    }

    totalBytes += content.byteLength;
    if (totalBytes > MAX_ATTACHMENT_BYTES) {
      return {
        attachments: [],
        error: `attachments exceed the ${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))}MB total limit`,
      };
    }

    attachments.push({
      filename,
      content,
      contentType: typeof item.contentType === "string" && item.contentType.trim().length > 0
        ? item.contentType.trim().slice(0, 100)
        : undefined,
    });
  }

  return { attachments };
}

function formatRetryAt(retryAt: number, now: number): string {
  const minutes = Math.max(1, Math.ceil((retryAt - now) / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/**
 * Validate, gate, send, and record one email.
 *
 * The order is deliberate: everything that can fail without a side effect fails
 * first, so a malformed call never consumes rate-limit budget and never opens a
 * socket. The only writes happen after the send attempt has actually been made.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailOutcome> {
  const { ctx, companyId, config, request, source } = input;
  const now = input.now ?? Date.now();
  const transportFactory = input.transportFactory ?? createNodemailerTransport;

  // --- shape ---------------------------------------------------------------
  if (!Array.isArray(request.to) || request.to.length === 0) {
    return { ok: false, error: "to must be a non-empty array of email addresses" };
  }
  if (request.to.length > MAX_RECIPIENTS) {
    return { ok: false, error: `to accepts at most ${MAX_RECIPIENTS} addresses` };
  }
  const rawCc = request.cc == null ? [] : request.cc;
  if (!Array.isArray(rawCc)) {
    return { ok: false, error: "cc must be an array of email addresses" };
  }
  if (rawCc.length > MAX_RECIPIENTS) {
    return { ok: false, error: `cc accepts at most ${MAX_RECIPIENTS} addresses` };
  }

  if (typeof request.subject !== "string" || sanitizeSubject(request.subject).length === 0) {
    return { ok: false, error: "subject is required" };
  }
  if (request.subject.length > MAX_SUBJECT_CHARS) {
    return { ok: false, error: `subject must be at most ${MAX_SUBJECT_CHARS} characters` };
  }
  if (typeof request.body !== "string" || request.body.trim().length === 0) {
    return { ok: false, error: "body is required" };
  }
  if (request.body.length > MAX_BODY_CHARS) {
    return { ok: false, error: `body must be at most ${MAX_BODY_CHARS} characters` };
  }

  // --- allowlist -----------------------------------------------------------
  // A partial send is worse than no send: the agent would report success while
  // some recipients silently never heard from it. So any bad address fails the
  // whole call, with the offending entries named so the agent can correct.
  const toResolution = resolveRecipients(request.to, config.allowedRecipients);
  const ccResolution = resolveRecipients(rawCc, config.allowedRecipients);

  const unparseable = [...toResolution.unparseable, ...ccResolution.unparseable];
  if (unparseable.length > 0) {
    return { ok: false, error: `not valid email addresses: ${unparseable.join(", ")}` };
  }
  const rejected = [...toResolution.rejected, ...ccResolution.rejected];
  if (rejected.length > 0) {
    return {
      ok: false,
      error:
        `these recipients are not on the operator's allowlist: ${rejected.join(", ")}. `
        + "Ask the operator to add them under Company settings → Email; the tool cannot widen its own allowlist.",
    };
  }
  if (toResolution.allowed.length === 0) {
    return { ok: false, error: "no usable recipients in to" };
  }

  const attachmentResult = prepareAttachments(request.attachments);
  if (attachmentResult.error) {
    return { ok: false, error: attachmentResult.error };
  }

  // --- rate limit ----------------------------------------------------------
  // A refusal here is deliberately *not* recorded. Logging blocked calls would
  // make each rejection extend its own window, turning a temporary limit into a
  // permanent lockout for an agent that keeps retrying.
  const budget = computeBudget(
    await readSendLog(ctx, companyId),
    { maxPerHour: config.maxPerHour, maxPerDay: config.maxPerDay },
    now,
  );
  if (budget.retryAt != null) {
    return {
      ok: false,
      error:
        `email rate limit reached for this company (${budget.hourUsed}/${budget.hourLimit} this hour, `
        + `${budget.dayUsed}/${budget.dayLimit} today). Try again in ${formatRetryAt(budget.retryAt, now)}.`,
    };
  }

  // --- build ---------------------------------------------------------------
  const subject = [config.subjectPrefix, sanitizeSubject(request.subject)]
    .filter((part): part is string => part != null && part.length > 0)
    .join(" ");

  const footer = source === "test"
    ? "Test message sent from Paperclip company settings."
    : input.runId
      ? `Sent automatically by a Paperclip agent (run ${input.runId}).`
      : "Sent automatically by a Paperclip agent.";

  const message = {
    from: formatFrom(config.fromAddress, config.fromName),
    to: toResolution.allowed,
    cc: ccResolution.allowed,
    replyTo: config.replyToAddress,
    subject,
    text: request.body,
    html: wrapEmailHtml(markdownToHtml(request.body), footer),
    attachments: attachmentResult.attachments,
  };

  // --- send ----------------------------------------------------------------
  const password = await resolvePassword(ctx, config, companyId);
  const transport = transportFactory(transportOptionsFor(config, password));

  let outcome: SendEmailOutcome;
  try {
    const result = await transport.sendMail(message);
    outcome = {
      ok: result.rejected.length === 0,
      messageId: result.messageId,
      recipients: toResolution.allowed,
      rejected: result.rejected,
      error:
        result.rejected.length > 0
          ? `the server refused ${result.rejected.join(", ")}`
          : undefined,
    };
  } catch (error) {
    outcome = {
      ok: false,
      error: describeSmtpError(error),
      recipients: toResolution.allowed,
    };
  } finally {
    try {
      transport.close();
    } catch {
      // A transport that cannot be closed has nothing left to tell us.
    }
  }

  // --- record --------------------------------------------------------------
  const allRecipients = [...toResolution.allowed, ...ccResolution.allowed];
  await appendSendLog(
    ctx,
    companyId,
    {
      at: now,
      to: allRecipients,
      subject,
      ok: outcome.ok,
      messageId: outcome.messageId,
      error: outcome.error,
      source,
      agentId: input.agentId,
      runId: input.runId,
    },
    now,
  );

  await ctx.activity.log({
    companyId,
    message: outcome.ok
      ? `Email sent to ${allRecipients.join(", ")}: ${subject}`
      : `Email to ${allRecipients.join(", ")} failed: ${outcome.error ?? "unknown error"}`,
    entityType: "email",
    entityId: outcome.messageId,
    metadata: {
      subject,
      recipients: allRecipients,
      ok: outcome.ok,
      source,
      agentId: input.agentId ?? null,
      runId: input.runId ?? null,
      attachmentCount: attachmentResult.attachments.length,
      error: outcome.error ?? null,
    },
  });

  return outcome;
}
