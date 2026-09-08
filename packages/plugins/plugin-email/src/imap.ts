import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import type { SmtpMessage } from "./smtp.js";

/**
 * The IMAP seam.
 *
 * Appending a draft to an IMAP mailbox lives behind `ImapClient` so the
 * draft saving pipeline can be tested without network sockets, and so
 * swapping or configuring IMAP transports touches one file.
 */

export interface ImapClientOptions {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  password: string | null;
  rejectUnauthorized: boolean;
  draftsFolder?: string | null;
}

export interface ImapDraftResult {
  messageId: string;
  path: string;
  uid?: number;
}

export interface ImapClient {
  appendDraft(message: SmtpMessage): Promise<ImapDraftResult>;
  verify(): Promise<void>;
  close(): Promise<void>;
}

export type ImapClientFactory = (options: ImapClientOptions) => ImapClient;

/** Compile an SmtpMessage into an RFC 822 MIME Buffer using nodemailer's stream transport. */
export async function compileMimeBuffer(
  message: SmtpMessage,
): Promise<{ messageId: string; buffer: Buffer }> {
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: "windows",
  });

  const info = await transport.sendMail({
    from: message.from,
    to: message.to,
    cc: message.cc && message.cc.length > 0 ? message.cc : undefined,
    bcc: message.bcc && message.bcc.length > 0 ? message.bcc : undefined,
    replyTo: message.replyTo,
    subject: message.subject,
    text: message.text,
    html: message.html,
    attachments: message.attachments,
  });

  return {
    messageId: info.messageId ?? "",
    buffer: info.message as Buffer,
  };
}

/** Build the real ImapFlow client. */
export const createImapFlowClient: ImapClientFactory = (options) => {
  let client: ImapFlow | null = null;

  function getClient(): ImapFlow {
    if (!client) {
      client = new ImapFlow({
        host: options.host,
        port: options.port,
        secure: options.secure,
        auth:
          options.username && options.password
            ? { user: options.username, pass: options.password }
            : undefined,
        tls: { rejectUnauthorized: options.rejectUnauthorized },
        logger: false,
      });
    }
    return client;
  }

  return {
    async appendDraft(message: SmtpMessage): Promise<ImapDraftResult> {
      const cl = getClient();
      await cl.connect();
      try {
        const { messageId, buffer } = await compileMimeBuffer(message);

        let targetFolder = options.draftsFolder?.trim();
        if (!targetFolder) {
          // Discover Drafts mailbox using SPECIAL-USE flag or standard folder names
          const mailboxes = await cl.list();
          const draftsBox = mailboxes.find((box) => {
            const pathLower = box.path.toLowerCase();
            const nameLower = box.name.toLowerCase();
            return (
              box.specialUse === "\\Drafts" ||
              pathLower === "drafts" ||
              pathLower === "inbox.drafts" ||
              pathLower.endsWith("/drafts") ||
              pathLower.endsWith(".drafts") ||
              pathLower === "[gmail]/drafts" ||
              nameLower === "drafts" ||
              nameLower === "concepten" ||
              pathLower === "concepten"
            );
          });
          targetFolder = draftsBox ? draftsBox.path : "Drafts";
        }

        const res = await cl.append(targetFolder, buffer, ["\\Draft", "\\Seen"]);
        return {
          messageId,
          path: targetFolder,
          uid: res && typeof res === "object" && "uid" in res ? res.uid : undefined,
        };
      } finally {
        try {
          await cl.logout();
        } catch {
          // A client that fails to cleanly logout is closed anyway.
        }
      }
    },

    async verify(): Promise<void> {
      const cl = getClient();
      await cl.connect();
      await cl.logout();
    },

    async close(): Promise<void> {
      if (client) {
        try {
          await client.logout();
        } catch {
          // Ignored
        }
        client = null;
      }
    },
  };
};

/**
 * Turn an IMAP failure into something an agent or operator can act on.
 *
 * Never echoes credentials or raw buffers.
 */
export function describeImapError(error: unknown): string {
  if (typeof error !== "object" || error === null) return String(error);
  const err = error as { code?: string; responseCode?: string; response?: string; message?: string };

  const parts: string[] = [];
  if (err.code === "EAUTH" || err.responseCode === "AUTHENTICATIONFAILED") {
    parts.push("IMAP authentication failed — check the username and password");
  } else if (
    err.code === "ECONNECTION" ||
    err.code === "ESOCKET" ||
    err.code === "ECONNREFUSED"
  ) {
    parts.push("Could not connect to the IMAP server");
  } else if (err.code === "ETIMEDOUT") {
    parts.push("The IMAP server did not respond in time");
  } else if (err.message) {
    parts.push(err.message);
  } else {
    parts.push("IMAP draft save failed");
  }

  if (err.response && err.response !== err.message) {
    parts.push(err.response.trim());
  }

  return parts.join(" ").trim();
}
