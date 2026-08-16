/**
 * Minimal Telegram Bot API client plus the Markdown→Telegram-HTML conversion
 * and message splitting the relay needs.
 *
 * Kept dependency-free and side-effect free so the formatting rules — the part
 * most likely to mangle an agent's output — are directly unit-testable.
 */

/** Telegram rejects messages longer than 4096 characters of parsed text. */
export const TELEGRAM_MAX_MESSAGE_CHARS = 4096;

/**
 * Markdown is split at a lower bound than the hard limit because the HTML
 * conversion adds tags, and a fence reopened across a split adds a few more
 * characters to the following chunk.
 */
export const SPLIT_BUDGET_CHARS = 3500;

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  username?: string;
  first_name?: string;
}

/** The non-text payloads the bridge recognizes well enough to describe. */
export interface TelegramAttachmentInfo {
  photo?: Array<{ file_id: string; width: number; height: number }>;
  document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  voice?: { file_id: string; duration: number };
  audio?: { file_id: string; title?: string; duration: number };
  video?: { file_id: string; duration: number };
  sticker?: { file_id: string; emoji?: string };
  location?: { latitude: number; longitude: number };
}

export interface TelegramMessage extends TelegramAttachmentInfo {
  message_id: number;
  message_thread_id?: number;
  date: number;
  edit_date?: number;
  text?: string;
  caption?: string;
  from?: TelegramUser;
  chat: { id: number; type: string; title?: string; is_forum?: boolean };
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  data?: string;
  message?: TelegramMessage;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  channel_post?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

/** A single tap-able button. `callback_data` is capped at 64 bytes by Telegram. */
export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface SendMessageInput {
  chatId: number | string;
  text: string;
  messageThreadId?: number | null;
  parseMode?: "HTML" | null;
  disableNotification?: boolean;
  replyMarkup?: InlineKeyboardMarkup | null;
}

export class TelegramApiError extends Error {
  readonly errorCode: number | null;
  readonly retryAfterSeconds: number | null;

  constructor(method: string, description: string, errorCode: number | null, retryAfter: number | null) {
    super(`Telegram ${method} failed: ${description}`);
    this.name = "TelegramApiError";
    this.errorCode = errorCode;
    this.retryAfterSeconds = retryAfter;
  }
}

export interface TelegramClientOptions {
  token: string;
  /** Injected so the host can trace outbound calls (`ctx.http.fetch`). */
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
}

export interface TelegramClient {
  getMe(): Promise<TelegramUser>;
  getUpdates(input: { offset?: number; timeoutSeconds: number; signal?: AbortSignal }): Promise<TelegramUpdate[]>;
  sendMessage(input: SendMessageInput): Promise<TelegramMessage>;
  createForumTopic(input: { chatId: number | string; name: string }): Promise<{ message_thread_id: number }>;
  /** Show the "typing…" indicator so a slow agent run does not read as silence. */
  sendChatAction(input: { chatId: number | string; messageThreadId?: number | null }): Promise<void>;
  /** Acknowledge a button tap. Telegram shows a spinner until this is called. */
  answerCallbackQuery(input: { callbackQueryId: string; text?: string }): Promise<void>;
  /** Remove the buttons from a decided message so it cannot be tapped twice. */
  clearInlineKeyboard(input: { chatId: number | string; messageId: number }): Promise<void>;
}

/** How long to wait when Telegram rate-limits without naming a delay. */
const DEFAULT_RETRY_AFTER_SECONDS = 3;

export function createTelegramClient(options: TelegramClientOptions): TelegramClient {
  async function callOnce<T>(method: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const response = await options.fetch(`https://api.telegram.org/bot${options.token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });

    const payload = (await response.json().catch(() => null)) as
      | {
        ok?: boolean;
        result?: T;
        description?: string;
        error_code?: number;
        parameters?: { retry_after?: number };
      }
      | null;

    if (!payload?.ok) {
      throw new TelegramApiError(
        method,
        payload?.description ?? `HTTP ${response.status}`,
        payload?.error_code ?? response.status,
        payload?.parameters?.retry_after ?? null,
      );
    }
    return payload.result as T;
  }

  /**
   * Telegram rate-limits per chat (roughly 20 messages/minute in a group). A
   * relayed answer that split into several chunks is exactly the shape that
   * trips it, so honour one `retry_after` rather than dropping the tail of a
   * message.
   */
  async function call<T>(method: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    try {
      return await callOnce<T>(method, body, signal);
    } catch (error) {
      if (!(error instanceof TelegramApiError) || error.errorCode !== 429) throw error;
      if (signal?.aborted) throw error;

      const waitMs = (error.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS) * 1_000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return await callOnce<T>(method, body, signal);
    }
  }

  return {
    async getMe() {
      return await call<TelegramUser>("getMe", {});
    },

    async getUpdates(input) {
      return await call<TelegramUpdate[]>(
        "getUpdates",
        {
          ...(input.offset === undefined ? {} : { offset: input.offset }),
          timeout: input.timeoutSeconds,
          // Only the update kinds the bridge acts on. Asking for the narrow set
          // keeps unrelated updates from advancing the offset in a way that
          // hides a real message behind a parse failure.
          allowed_updates: ["message", "edited_message", "callback_query"],
        },
        input.signal,
      );
    },

    async sendMessage(input) {
      return await call<TelegramMessage>("sendMessage", {
        chat_id: input.chatId,
        text: input.text,
        ...(input.messageThreadId ? { message_thread_id: input.messageThreadId } : {}),
        ...(input.parseMode ? { parse_mode: input.parseMode } : {}),
        ...(input.disableNotification ? { disable_notification: true } : {}),
        ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
        link_preview_options: { is_disabled: true },
      });
    },

    async createForumTopic(input) {
      return await call<{ message_thread_id: number }>("createForumTopic", {
        chat_id: input.chatId,
        name: input.name.slice(0, 128),
      });
    },

    async sendChatAction(input) {
      await call("sendChatAction", {
        chat_id: input.chatId,
        action: "typing",
        ...(input.messageThreadId ? { message_thread_id: input.messageThreadId } : {}),
      });
    },

    async answerCallbackQuery(input) {
      await call("answerCallbackQuery", {
        callback_query_id: input.callbackQueryId,
        ...(input.text ? { text: input.text.slice(0, 200) } : {}),
      });
    },

    async clearInlineKeyboard(input) {
      await call("editMessageReplyMarkup", {
        chat_id: input.chatId,
        message_id: input.messageId,
        reply_markup: { inline_keyboard: [] },
      });
    },
  };
}

/**
 * Describe a non-text message so a photo or voice note is visible in the issue
 * thread instead of vanishing. The host exposes no attachment-upload API to
 * plugins, so the file itself stays in Telegram — saying so is more honest than
 * dropping the message.
 */
export function describeAttachment(message: TelegramAttachmentInfo): string | null {
  if (message.photo?.length) return "[photo sent in Telegram]";
  if (message.document) {
    const name = message.document.file_name ?? "file";
    return `[document sent in Telegram: ${name}]`;
  }
  if (message.voice) return `[voice note sent in Telegram, ${message.voice.duration}s]`;
  if (message.audio) return `[audio sent in Telegram: ${message.audio.title ?? "untitled"}]`;
  if (message.video) return `[video sent in Telegram, ${message.video.duration}s]`;
  if (message.sticker) return `[sticker: ${message.sticker.emoji ?? "?"}]`;
  if (message.location) {
    return `[location: ${message.location.latitude}, ${message.location.longitude}]`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

const FENCE_RE = /^\s*```(.*)$/;

/**
 * Split Markdown into chunks that each stay within `limit` characters while
 * keeping code fences balanced: a fence open at a split point is closed at the
 * end of the chunk and reopened (with its language) at the start of the next.
 *
 * Splitting the Markdown source rather than the rendered HTML is deliberate —
 * splitting rendered HTML can cut a tag in half, which Telegram rejects with
 * "can't parse entities" and costs the whole message.
 */
export function splitMarkdown(source: string, limit = SPLIT_BUDGET_CHARS): string[] {
  const normalized = source.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return [];
  if (normalized.length <= limit) return [normalized];

  const chunks: string[] = [];
  let current: string[] = [];
  let currentLength = 0;
  let fenceLanguage: string | null = null;

  const flush = () => {
    if (current.length === 0) return;
    const reopen = fenceLanguage !== null;
    if (reopen) current.push("```");
    chunks.push(current.join("\n").trim());
    current = reopen ? [`\`\`\`${fenceLanguage}`] : [];
    currentLength = current.reduce((total, line) => total + line.length + 1, 0);
  };

  const pushLine = (line: string) => {
    if (currentLength + line.length + 1 > limit) flush();
    current.push(line);
    currentLength += line.length + 1;
  };

  for (const line of normalized.split("\n")) {
    const fenceMatch = FENCE_RE.exec(line);
    if (fenceMatch) {
      // Toggle fence state around the line itself so the delimiter always
      // lands in the same chunk as the block it opens or closes.
      if (fenceLanguage === null) {
        pushLine(line);
        fenceLanguage = fenceMatch[1]?.trim() ?? "";
      } else {
        fenceLanguage = null;
        pushLine(line);
      }
      continue;
    }

    if (line.length + 1 <= limit) {
      pushLine(line);
      continue;
    }

    // A single line longer than the budget (a pasted URL wall, minified JSON)
    // has no safe break point; slice it.
    for (let index = 0; index < line.length; index += limit) {
      pushLine(line.slice(index, index + limit));
    }
  }

  flush();
  return chunks.filter((chunk) => chunk.length > 0);
}

/**
 * Convert the Markdown subset agents actually emit into the HTML subset
 * Telegram accepts. Anything not recognized is escaped and passed through as
 * plain text — a formatting miss is acceptable, an unparseable message is not.
 */
export function toTelegramHtml(markdown: string): string {
  const codeBlocks: string[] = [];
  const inlineCode: string[] = [];

  // Placeholders are wrapped in NUL. Stripping NUL from the input first means
  // no agent or user content can forge a placeholder and have arbitrary HTML
  // restored in its place.
  const blockToken = (index: number) => `\u0000B${index}\u0000`;
  const inlineToken = (index: number) => `\u0000I${index}\u0000`;

  let working = markdown.replace(/\r\n/g, "\n").replaceAll("\u0000", "");

  working = working.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_match, language: string, code: string) => {
    const lang = language.trim();
    const body = escapeHtml(code.replace(/\n$/, ""));
    codeBlocks.push(
      lang
        ? `<pre><code class="language-${escapeHtml(lang)}">${body}</code></pre>`
        : `<pre>${body}</pre>`,
    );
    return blockToken(codeBlocks.length - 1);
  });

  working = working.replace(/`([^`\n]+)`/g, (_match, code: string) => {
    inlineCode.push(`<code>${escapeHtml(code)}</code>`);
    return inlineToken(inlineCode.length - 1);
  });

  working = escapeHtml(working);

  // Markdown links. The URL is escaped and quoted; only http(s) and tg links
  // are emitted so a `javascript:` href can never reach a client.
  working = working.replace(
    /\[([^\]\n]+)\]\(([^)\s]+)\)/g,
    (match, label: string, href: string) => {
      if (!/^(https?:\/\/|tg:\/\/)/i.test(href)) return match;
      return `<a href="${href.replaceAll('"', "%22")}">${label}</a>`;
    },
  );

  working = working
    // Headings become bold lines; Telegram has no heading markup.
    .replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>")
    // Horizontal rules have no equivalent either.
    .replace(/^\s*([-*_])\1{2,}\s*$/gm, "—")
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/__([^_\n]+)__/g, "<b>$1</b>")
    .replace(/~~([^~\n]+)~~/g, "<s>$1</s>")
    // Single-asterisk italics only when both delimiters hug non-space text,
    // so `2 * 3 * 4` and bullet markers survive untouched.
    .replace(/(^|[\s(])\*([^\s*][^*\n]*?[^\s*]|[^\s*])\*(?=[\s).,!?:;]|$)/g, "$1<i>$2</i>")
    // Normalize list bullets: "- " and "* " both render as "• ".
    .replace(/^\s*[-*]\s+/gm, "• ");

  working = working.replace(/\u0000I(\d+)\u0000/g, (_match, index: string) => inlineCode[Number(index)] ?? "");
  working = working.replace(/\u0000B(\d+)\u0000/g, (_match, index: string) => codeBlocks[Number(index)] ?? "");

  return working.trim();
}

/**
 * Render an agent message as one or more Telegram-ready HTML payloads.
 * `header` is prepended to the first chunk only, and continuation chunks are
 * numbered so a split answer still reads in order.
 */
export function renderForTelegram(body: string, header?: string): string[] {
  const chunks = splitMarkdown(body);
  if (chunks.length === 0) return header ? [toTelegramHtml(header)] : [];

  return chunks.map((chunk, index) => {
    const parts: string[] = [];
    if (index === 0 && header) parts.push(toTelegramHtml(header));
    else if (index > 0) parts.push(`<i>(${index + 1}/${chunks.length})</i>`);
    parts.push(toTelegramHtml(chunk));
    return parts.join("\n").slice(0, TELEGRAM_MAX_MESSAGE_CHARS);
  });
}
