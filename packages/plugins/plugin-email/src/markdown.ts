/**
 * A small, deliberately incomplete Markdown → HTML renderer for email bodies.
 *
 * Agents write Markdown whether or not you ask them to, so the tool takes
 * Markdown and sends the raw source as the plain-text alternative and this
 * rendering as the HTML one.
 *
 * Two rules shape the implementation:
 *
 * 1. Raw HTML in the source is escaped, never passed through. The body is model
 *    output, and a model that read a poisoned document could otherwise be
 *    talked into emitting a tracking pixel, a form, or a link that renders as
 *    something other than where it goes.
 * 2. Only http, https, and mailto links survive. Everything else keeps its
 *    label and loses its href.
 */

/** Wrapper byte for internal placeholders. Stripped from input so it cannot be forged. */
const SENTINEL = String.fromCharCode(0);

const SAFE_LINK_SCHEME = /^(https?:\/\/|mailto:)/i;

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render inline markup within one block of text.
 *
 * Code spans are lifted out before escaping so that markdown rules never apply
 * inside them — `**not bold**` must survive as literal asterisks.
 */
function renderInline(text: string): string {
  const codeSpans: string[] = [];
  let work = text.replace(/`([^`]+)`/g, (_full, code: string) => {
    codeSpans.push(escapeHtml(code));
    return `${SENTINEL}C${codeSpans.length - 1}${SENTINEL}`;
  });

  work = escapeHtml(work);

  work = work.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (_full, label: string, href: string) => {
    // The href is already HTML-escaped at this point, which is what we want
    // inside the attribute; the scheme test is unaffected by that escaping.
    if (!SAFE_LINK_SCHEME.test(href)) return label;
    return `<a href="${href}" style="color:#2563eb;">${label}</a>`;
  });

  work = work.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  work = work.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  work = work.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  // Single-asterisk emphasis, but only when the asterisks hug the word. Without
  // the boundary guards, `2 * 3 * 4` turns into arithmetic-flavoured italics.
  work = work.replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?![\w*])/g, "$1<em>$2</em>");

  return work.replace(
    new RegExp(`${SENTINEL}C(\\d+)${SENTINEL}`, "g"),
    (_full, index: string) =>
      `<code style="background:#f4f4f5;padding:1px 4px;border-radius:3px;">${codeSpans[Number(index)] ?? ""}</code>`,
  );
}

/** True when `line` is the `|---|---|` separator under a table header. */
function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|") || !trimmed.includes("-")) return false;
  return splitTableRow(trimmed).every((cell) => /^:?-{1,}:?$/.test(cell.trim()));
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|");
}

const TABLE_CELL_STYLE = "border:1px solid #e4e4e7;padding:6px 10px;text-align:left;";

function renderTable(headerLine: string, bodyLines: string[]): string {
  const headers = splitTableRow(headerLine).map((cell) => renderInline(cell.trim()));
  const rows = bodyLines.map((line) => splitTableRow(line).map((cell) => renderInline(cell.trim())));

  const head = headers
    .map((cell) => `<th style="${TABLE_CELL_STYLE}background:#fafafa;">${cell}</th>`)
    .join("");
  const body = rows
    .map(
      (cells) =>
        `<tr>${cells.map((cell) => `<td style="${TABLE_CELL_STYLE}">${cell}</td>`).join("")}</tr>`,
    )
    .join("");

  return `<table style="border-collapse:collapse;margin:12px 0;font-size:14px;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/**
 * Convert a Markdown document to an HTML fragment.
 *
 * Line-based on purpose: a full block parser would buy nesting we do not want
 * in an email body anyway.
 */
export function markdownToHtml(source: string): string {
  const lines = source
    .split(SENTINEL)
    .join("")
    .replace(/\r\n?/g, "\n")
    .split("\n");

  const out: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    // Fenced code block. An unterminated fence runs to the end of the document
    // rather than falling back to paragraphs, which keeps a truncated report
    // readable instead of exploding it into markup.
    const fence = line.match(/^\s*```(\w*)\s*$/);
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index] ?? "")) {
        body.push(lines[index] ?? "");
        index += 1;
      }
      index += 1;
      out.push(
        `<pre style="background:#f4f4f5;padding:12px;border-radius:4px;overflow-x:auto;"><code>${escapeHtml(body.join("\n"))}</code></pre>`,
      );
      continue;
    }

    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push('<hr style="border:none;border-top:1px solid #e4e4e7;margin:20px 0;" />');
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1]!.length, 4);
      const sizes = ["20px", "17px", "15px", "14px"];
      out.push(
        `<h${level} style="font-size:${sizes[level - 1]};margin:18px 0 8px;">${renderInline(heading[2]!.trim())}</h${level}>`,
      );
      index += 1;
      continue;
    }

    // Table: a header row followed by a separator row.
    if (line.includes("|") && isTableSeparator(lines[index + 1] ?? "")) {
      const headerLine = line;
      const bodyLines: string[] = [];
      index += 2;
      while (index < lines.length && (lines[index] ?? "").includes("|") && (lines[index] ?? "").trim().length > 0) {
        bodyLines.push(lines[index] ?? "");
        index += 1;
      }
      out.push(renderTable(headerLine, bodyLines));
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const body: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index] ?? "")) {
        body.push((lines[index] ?? "").replace(/^\s*>\s?/, ""));
        index += 1;
      }
      out.push(
        `<blockquote style="margin:12px 0;padding-left:12px;border-left:3px solid #e4e4e7;color:#52525b;">${renderInline(body.join(" "))}</blockquote>`,
      );
      continue;
    }

    const bulletMatch = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bulletMatch) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = (lines[index] ?? "").match(/^\s*[-*+]\s+(.*)$/);
        if (!item) break;
        items.push(`<li style="margin:2px 0;">${renderInline(item[1]!)}</li>`);
        index += 1;
      }
      out.push(`<ul style="margin:8px 0;padding-left:22px;">${items.join("")}</ul>`);
      continue;
    }

    const orderedMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (orderedMatch) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = (lines[index] ?? "").match(/^\s*\d+\.\s+(.*)$/);
        if (!item) break;
        items.push(`<li style="margin:2px 0;">${renderInline(item[1]!)}</li>`);
        index += 1;
      }
      out.push(`<ol style="margin:8px 0;padding-left:22px;">${items.join("")}</ol>`);
      continue;
    }

    // Paragraph: consume until a blank line or the start of another block.
    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index] ?? "";
      if (current.trim().length === 0) break;
      if (/^\s*(```|#{1,6}\s|>\s?|[-*+]\s|\d+\.\s)/.test(current)) break;
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(current)) break;
      paragraph.push(current.trim());
      index += 1;
    }
    if (paragraph.length > 0) {
      out.push(`<p style="margin:10px 0;">${renderInline(paragraph.join(" "))}</p>`);
    }
  }

  return out.join("\n");
}

/**
 * Wrap a rendered fragment in the minimal document a mail client expects,
 * or interpolate into a company-configured custom HTML template if provided.
 *
 * Supported placeholders in custom templates:
 * - `{{body}}` or `[body]` (the rendered HTML fragment)
 * - `{{footer}}` or `[footer]` (the automated footer text, HTML-escaped)
 * - `{{subject}}` or `[subject]` (the subject line, HTML-escaped)
 */
export function wrapEmailHtml(
  fragment: string,
  footer: string | null,
  customTemplate?: string | null,
  subject?: string | null,
): string {
  if (customTemplate && customTemplate.trim().length > 0) {
    const escapedFooter = footer != null ? escapeHtml(footer) : "";
    const escapedSubject = subject != null ? escapeHtml(subject) : "";

    return customTemplate
      .replaceAll("{{body}}", fragment)
      .replaceAll("[body]", fragment)
      .replaceAll("{{footer}}", escapedFooter)
      .replaceAll("[footer]", escapedFooter)
      .replaceAll("{{subject}}", escapedSubject)
      .replaceAll("[subject]", escapedSubject);
  }

  const footerHtml =
    footer == null
      ? ""
      : `<hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0 12px;" /><p style="margin:0;font-size:12px;color:#71717a;">${escapeHtml(footer)}</p>`;

  return [
    '<!doctype html><html><head><meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    "</head>",
    '<body style="margin:0;padding:0;background:#ffffff;">',
    '<div style="max-width:640px;margin:0 auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#18181b;">',
    fragment,
    footerHtml,
    "</div></body></html>",
  ].join("");
}
