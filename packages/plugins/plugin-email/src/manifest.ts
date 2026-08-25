import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

/** Stable plugin ID used by host registration, state namespacing, and tool namespacing. */
export const PLUGIN_ID = "paperclip.email";
export const PLUGIN_VERSION = "0.1.0";

/**
 * Tool name as declared here and registered in the worker. The host namespaces
 * it to `paperclip.email:send_email` at runtime, so it cannot shadow a core tool.
 */
export const TOOL_SEND_EMAIL = "send_email";

/** UI slot / action / data keys, shared between the worker and the UI bundle. */
export const SLOT_COMPANY_SETTINGS = "email-company-settings";
export const EXPORT_COMPANY_SETTINGS = "EmailCompanySettingsPage";
export const DATA_OVERVIEW = "overview";
export const ACTION_SEND_TEST = "sendTest";

/**
 * SMTP email sender.
 *
 * Deliberately narrow: an agent may choose *what* to say and *which* of the
 * operator's allowlisted addresses to say it to. It may not choose the sender,
 * the reply-to, or a recipient outside the allowlist, because the tool
 * arguments are model output and model output is attacker-reachable through
 * any document the agent reads.
 *
 * Note there is no `http.outbound` capability here: SMTP is a raw TCP/TLS
 * socket opened by nodemailer inside the worker process, not a host-mediated
 * fetch. The host therefore cannot audit the connection itself — the audit
 * trail this plugin offers is the activity-log entry it writes per send.
 */
const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Email (SMTP)",
  description:
    "Lets agents send email through your own SMTP server. Recipients must be allowlisted, the sender and reply-to are fixed by the operator, and every send is rate limited per company and written to the activity log.",
  author: "Paperclip",
  categories: ["connector"],
  capabilities: [
    // Contribute the send_email tool to agent runs.
    "agent.tools.register",
    // SMTP password is stored as a secret ref and resolved per send.
    "secrets.read-ref",
    // Rate-limit window and send history.
    "plugin.state.read",
    "plugin.state.write",
    // Delivery status: one entry per send attempt, success or failure.
    "activity.log.write",
    // Company settings page with the test-send button.
    "instance.settings.register",
    "ui.action.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  tools: [
    {
      name: TOOL_SEND_EMAIL,
      displayName: "Send email",
      description:
        "Send an email through the company's configured SMTP server. Recipients must appear in the operator's allowlist or the call fails. The sender address and reply-to are set by the operator and cannot be overridden. The body is Markdown and is delivered as both plain text and HTML.",
      parametersSchema: {
        type: "object",
        required: ["to", "subject", "body"],
        additionalProperties: false,
        properties: {
          to: {
            type: "array",
            description: "Recipient addresses. Every entry must match the operator's allowlist.",
            items: { type: "string" },
            minItems: 1,
            maxItems: 20,
          },
          cc: {
            type: "array",
            description: "Optional CC addresses. Also allowlist-checked.",
            items: { type: "string" },
            maxItems: 20,
          },
          subject: {
            type: "string",
            description: "Subject line. Newlines are stripped.",
            maxLength: 200,
          },
          body: {
            type: "string",
            description:
              "Message body in Markdown. Headings, bold, italic, code, lists, links, and pipe tables are rendered to HTML; the raw Markdown is sent as the plain-text alternative.",
            maxLength: 100000,
          },
          attachments: {
            type: "array",
            description: "Optional file attachments, base64-encoded.",
            maxItems: 5,
            items: {
              type: "object",
              required: ["filename", "contentBase64"],
              additionalProperties: false,
              properties: {
                filename: { type: "string", maxLength: 200 },
                contentBase64: { type: "string" },
                contentType: { type: "string", maxLength: 100 },
              },
            },
          },
        },
      },
    },
  ],
  ui: {
    slots: [
      {
        type: "companySettingsPage",
        id: SLOT_COMPANY_SETTINGS,
        displayName: "Email",
        exportName: EXPORT_COMPANY_SETTINGS,
        routePath: "email",
      },
    ],
  },
  instanceConfigSchema: {
    type: "object",
    required: ["host", "fromAddress", "replyToAddress", "allowedRecipients"],
    properties: {
      host: {
        title: "SMTP host",
        description: "Hostname of your SMTP server, e.g. smtp.fastmail.com.",
        type: "string",
      },
      port: {
        title: "SMTP port",
        description: "587 for STARTTLS (the usual choice), 465 for implicit TLS, 25 for an internal relay.",
        type: "number",
        default: 587,
      },
      secure: {
        title: "Implicit TLS",
        description:
          "On for port 465, where TLS is negotiated before the SMTP greeting. Leave off for 587, which upgrades via STARTTLS.",
        type: "boolean",
        default: false,
      },
      username: {
        title: "SMTP username",
        description: "Leave empty for a relay that authenticates by IP instead of credentials.",
        type: "string",
      },
      password: {
        // "secret-ref" makes the settings UI render a company-secret picker
        // instead of a plain text box. The picker stores a bound secret as an
        // object ({ type: "secret_ref", secretId }) and a pasted value as a
        // plain string, so the schema has to accept both — declaring only
        // "string" makes the host reject every picked secret.
        title: "SMTP password",
        description:
          "Pick an existing secret, or paste the password once and it is stored as a secret on save.",
        type: ["string", "object"],
        format: "secret-ref",
      },
      rejectUnauthorized: {
        title: "Verify TLS certificate",
        description:
          "Keep this on. Turn it off only for an internal relay with a self-signed certificate, and understand that it disables the check that you are talking to the server you think you are.",
        type: "boolean",
        default: true,
      },
      fromAddress: {
        title: "From address",
        description:
          "The only address this plugin sends as. Agents cannot override it, which is what stops a prompt injection from mailing your colleagues as you.",
        type: "string",
      },
      fromName: {
        title: "From display name",
        description: "Optional display name shown next to the from address.",
        type: "string",
        default: "Paperclip",
      },
      replyToAddress: {
        title: "Reply-to address",
        description:
          "Where replies go. Required, because a report nobody can answer is a dead end — point this at a human or a shared inbox.",
        type: "string",
      },
      bccAddress: {
        title: "BCC address",
        description:
          "Optional BCC address. If configured, a copy of all outgoing emails sent via the plugin will be delivered here.",
        type: "string",
      },
      allowedRecipients: {
        title: "Allowed recipients",
        description:
          "Exact addresses (jelle@example.com) or whole domains (@example.com). An empty list blocks every send.",
        type: "array",
        items: { type: "string" },
        default: [],
      },
      subjectPrefix: {
        title: "Subject prefix",
        description: "Optional tag prepended to every subject, e.g. [Paperclip], so recipients can filter.",
        type: "string",
      },
      htmlTemplate: {
        title: "Custom HTML template",
        description:
          "Optional custom HTML template containing {{body}} or [body] placeholder (and optional {{subject}} and {{footer}}). Leave empty for the default clean theme.",
        type: "string",
        format: "textarea",
        maxLength: 100000,
      },
      maxPerHour: {
        title: "Max emails per hour",
        description: "Per company. Catches an agent stuck in a loop before your provider throttles you.",
        type: "number",
        default: 20,
      },
      maxPerDay: {
        title: "Max emails per day",
        description: "Per company, over a rolling 24 hours.",
        type: "number",
        default: 100,
      },
    },
  },
};

export default manifest;
