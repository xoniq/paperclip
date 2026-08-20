import nodemailer from "nodemailer";
import type { EmailConfig } from "./config.js";

/**
 * The SMTP seam.
 *
 * Everything nodemailer-shaped lives behind `SmtpTransport` so the send
 * pipeline can be tested without a socket, and so swapping in a second
 * transport later (an HTTPS mail API, say) touches one file.
 */

export interface SmtpAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface SmtpMessage {
  from: string;
  to: string[];
  cc?: string[];
  replyTo: string;
  subject: string;
  /** Plain-text alternative. */
  text: string;
  /** HTML alternative. */
  html: string;
  attachments?: SmtpAttachment[];
}

export interface SmtpSendResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
  response: string;
}

export interface SmtpTransport {
  sendMail(message: SmtpMessage): Promise<SmtpSendResult>;
  /** Open a connection and authenticate without sending anything. */
  verify(): Promise<void>;
  close(): void;
}

export interface SmtpTransportOptions {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  password: string | null;
  rejectUnauthorized: boolean;
}

export type SmtpTransportFactory = (options: SmtpTransportOptions) => SmtpTransport;

/**
 * Timeouts.
 *
 * A plugin worker RPC round trip is capped at 30s host-side. A silently
 * dropped SMTP port would otherwise hold the call open until that cap and
 * surface to the agent as an opaque worker timeout instead of "your mail
 * server did not answer".
 */
const CONNECTION_TIMEOUT_MS = 10_000;
const GREETING_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 20_000;

/** Build the real nodemailer transport. */
export const createNodemailerTransport: SmtpTransportFactory = (options) => {
  const transport = nodemailer.createTransport({
    host: options.host,
    port: options.port,
    secure: options.secure,
    auth:
      options.username && options.password
        ? { user: options.username, pass: options.password }
        : undefined,
    tls: { rejectUnauthorized: options.rejectUnauthorized },
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    greetingTimeout: GREETING_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
  });

  return {
    async sendMail(message) {
      const info = await transport.sendMail({
        from: message.from,
        to: message.to,
        cc: message.cc && message.cc.length > 0 ? message.cc : undefined,
        replyTo: message.replyTo,
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments: message.attachments,
      });
      return {
        messageId: info.messageId ?? "",
        // Nodemailer types these as (string | Address)[]; the server only ever
        // hands back addresses for an SMTP transport.
        accepted: (info.accepted ?? []).map((entry) => String(entry)),
        rejected: (info.rejected ?? []).map((entry) => String(entry)),
        response: info.response ?? "",
      };
    },
    async verify() {
      await transport.verify();
    },
    close() {
      transport.close();
    },
  };
};

/** Derive transport options from an operator config plus a freshly resolved password. */
export function transportOptionsFor(config: EmailConfig, password: string | null): SmtpTransportOptions {
  return {
    host: config.host,
    port: config.port,
    secure: config.secure,
    username: config.username,
    password,
    rejectUnauthorized: config.rejectUnauthorized,
  };
}

/**
 * Turn a transport failure into something an agent or operator can act on.
 *
 * Nodemailer surfaces the useful part as a `code` and buries the rest in a
 * stack. The message must never echo the password, so only the code and the
 * server's own response text are carried through.
 */
export function describeSmtpError(error: unknown): string {
  if (typeof error !== "object" || error === null) return String(error);
  const err = error as { code?: string; responseCode?: number; response?: string; message?: string };

  const parts: string[] = [];
  if (err.code === "EAUTH") parts.push("SMTP authentication failed — check the username and password");
  else if (err.code === "ECONNECTION" || err.code === "ESOCKET") parts.push("Could not connect to the SMTP server");
  else if (err.code === "ETIMEDOUT") parts.push("The SMTP server did not respond in time");
  else if (err.code === "EENVELOPE") parts.push("The server refused the envelope (sender or recipient)");
  else if (err.message) parts.push(err.message);
  else parts.push("SMTP send failed");

  if (err.responseCode) parts.push(`(${err.responseCode})`);
  if (err.response && err.response !== err.message) parts.push(err.response.trim());

  return parts.join(" ").trim();
}
