import { describe, expect, it } from "vitest";
import {
  renderForTelegram,
  splitMarkdown,
  toTelegramHtml,
  TELEGRAM_MAX_MESSAGE_CHARS,
} from "../src/telegram.js";
import { parseConfig, validateConfig } from "../src/config.js";

describe("toTelegramHtml", () => {
  it("escapes HTML that agents emit as prose", () => {
    expect(toTelegramHtml("Use <div> & <span>")).toBe("Use &lt;div&gt; &amp; &lt;span&gt;");
  });

  it("keeps code blocks verbatim and escaped", () => {
    const html = toTelegramHtml("Here:\n```ts\nconst a = 1 < 2;\n```");
    expect(html).toContain('<pre><code class="language-ts">const a = 1 &lt; 2;</code></pre>');
  });

  it("does not apply markdown rules inside code", () => {
    const html = toTelegramHtml("`**not bold**`");
    expect(html).toBe("<code>**not bold**</code>");
  });

  it("converts the markdown subset agents actually use", () => {
    expect(toTelegramHtml("**bold**")).toBe("<b>bold</b>");
    expect(toTelegramHtml("## Heading")).toBe("<b>Heading</b>");
    expect(toTelegramHtml("~~gone~~")).toBe("<s>gone</s>");
    expect(toTelegramHtml("- one\n- two")).toBe("• one\n• two");
  });

  it("leaves arithmetic alone when converting italics", () => {
    expect(toTelegramHtml("2 * 3 * 4 = 24")).toBe("2 * 3 * 4 = 24");
    expect(toTelegramHtml("an *emphasised* word")).toBe("an <i>emphasised</i> word");
  });

  it("only emits links with a safe scheme", () => {
    expect(toTelegramHtml("[docs](https://example.com)")).toBe('<a href="https://example.com">docs</a>');
    expect(toTelegramHtml("[x](javascript:alert(1))")).toContain("javascript:alert(1)");
    expect(toTelegramHtml("[x](javascript:alert(1))")).not.toContain("<a href");
  });

  it("cannot be tricked into restoring forged placeholders", () => {
    // Placeholders are NUL-wrapped. Content arriving with its own NUL bytes
    // must not be able to name a placeholder slot and have HTML injected.
    const nul = String.fromCharCode(0);
    const html = toTelegramHtml(`${nul}B0${nul} plain <b>text</b>`);
    expect(html).toBe("B0 plain &lt;b&gt;text&lt;/b&gt;");
  });
});

describe("splitMarkdown", () => {
  it("returns a single chunk when the text fits", () => {
    expect(splitMarkdown("short", 100)).toEqual(["short"]);
  });

  it("keeps code fences balanced across a split", () => {
    const source = ["```ts", ...Array.from({ length: 40 }, (_, i) => `line ${i}`), "```"].join("\n");
    const chunks = splitMarkdown(source, 120);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const fences = (chunk.match(/```/g) ?? []).length;
      expect(fences % 2).toBe(0);
    }
    expect(chunks.slice(1).every((chunk) => chunk.startsWith("```ts"))).toBe(true);
  });

  it("slices a single line that has no break point", () => {
    const chunks = splitMarkdown("x".repeat(250), 100);
    expect(chunks.length).toBe(3);
    expect(chunks.every((chunk) => chunk.length <= 100)).toBe(true);
  });

  it("drops nothing from the source", () => {
    const source = Array.from({ length: 60 }, (_, i) => `paragraph ${i}`).join("\n\n");
    const rejoined = splitMarkdown(source, 200).join("\n").replace(/\s+/g, " ");
    for (let i = 0; i < 60; i += 1) {
      expect(rejoined).toContain(`paragraph ${i}`);
    }
  });
});

describe("renderForTelegram", () => {
  it("puts the header on the first chunk only and numbers the rest", () => {
    const body = Array.from({ length: 900 }, (_, i) => `line ${i}`).join("\n");
    const rendered = renderForTelegram(body, "From the board:");

    expect(rendered.length).toBeGreaterThan(1);
    expect(rendered[0]).toContain("From the board:");
    expect(rendered[1]).toContain("(2/");
    expect(rendered.every((chunk) => chunk.length <= TELEGRAM_MAX_MESSAGE_CHARS)).toBe(true);
  });

  it("returns nothing for an empty body and no header", () => {
    expect(renderForTelegram("   ")).toEqual([]);
  });
});

describe("validateConfig", () => {
  const valid = {
    botToken: { type: "secret_ref", secretId: "sec-1" },
    operatorUserId: "user-1",
    allowedTelegramUserIds: [12345],
  };

  it("accepts a complete config", () => {
    expect(validateConfig(valid)).toMatchObject({ ok: true, errors: [] });
  });

  it("fails closed on an empty allowlist", () => {
    const result = validateConfig({ ...valid, allowedTelegramUserIds: [] });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("allowedTelegramUserIds is empty");
  });

  it("rejects non-numeric Telegram IDs instead of silently dropping them", () => {
    const result = validateConfig({ ...valid, allowedTelegramUserIds: ["not-an-id"] });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("non-numeric");
  });

  it("accepts numeric IDs pasted as strings", () => {
    expect(parseConfig({ ...valid, allowedTelegramUserIds: ["12345"] }).allowedTelegramUserIds).toEqual([12345]);
  });

  it("requires a webhook secret in webhook mode", () => {
    const result = validateConfig({ ...valid, transport: "webhook" });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("webhookSecretToken is required");
  });

  it("warns when the bot token is stored inline", () => {
    const result = validateConfig({ ...valid, botToken: "123:literal" });
    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toContain("secret reference");
  });
});
