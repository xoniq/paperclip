import { describe, expect, it } from "vitest";
import { escapeHtml, markdownToHtml, wrapEmailHtml } from "../src/markdown.js";

describe("escapeHtml", () => {
  it("escapes every character that could start markup", () => {
    expect(escapeHtml(`<div class="x" data-y='z'>&</div>`)).toBe(
      "&lt;div class=&quot;x&quot; data-y=&#39;z&#39;&gt;&amp;&lt;/div&gt;",
    );
  });
});

describe("markdownToHtml", () => {
  it("escapes raw HTML in the body rather than passing it through", () => {
    // The body is model output. A poisoned document must not be able to talk
    // an agent into emitting a tracking pixel or a disguised link.
    const html = markdownToHtml('Look <img src="https://tracker.example/x.gif"> here');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("renders headings, emphasis, and lists", () => {
    expect(markdownToHtml("## Summary")).toContain("<h2");
    expect(markdownToHtml("**bold**")).toContain("<strong>bold</strong>");
    expect(markdownToHtml("an *emphasised* word")).toContain("<em>emphasised</em>");
    expect(markdownToHtml("~~gone~~")).toContain("<del>gone</del>");

    const list = markdownToHtml("- one\n- two");
    expect(list).toContain("<ul");
    expect(list).toContain("<li style=\"margin:2px 0;\">one</li>");

    const ordered = markdownToHtml("1. first\n2. second");
    expect(ordered).toContain("<ol");
    expect(ordered).toContain("second");
  });

  it("leaves arithmetic alone when converting emphasis", () => {
    expect(markdownToHtml("2 * 3 * 4 = 24")).toContain("2 * 3 * 4 = 24");
  });

  it("keeps code verbatim and applies no markdown inside it", () => {
    expect(markdownToHtml("`**not bold**`")).toContain("**not bold**");
    expect(markdownToHtml("`**not bold**`")).not.toContain("<strong>");

    const fenced = markdownToHtml("```ts\nconst a = 1 < 2;\n```");
    expect(fenced).toContain("<pre");
    expect(fenced).toContain("const a = 1 &lt; 2;");
  });

  it("runs an unterminated fence to the end instead of exploding into markup", () => {
    const html = markdownToHtml("```\nline one\nline two");
    expect(html).toContain("<pre");
    expect(html).toContain("line two");
  });

  it("only emits links with a safe scheme", () => {
    expect(markdownToHtml("[docs](https://example.com)")).toContain('<a href="https://example.com"');
    expect(markdownToHtml("[mail](mailto:x@example.com)")).toContain('href="mailto:x@example.com"');

    const dangerous = markdownToHtml("[click](javascript:alert(1))");
    expect(dangerous).not.toContain("<a href");
    expect(dangerous).toContain("click");

    const dataUri = markdownToHtml("[click](data:text/html;base64,PHNjcmlwdD4=)");
    expect(dataUri).not.toContain("<a href");
  });

  it("renders a pipe table", () => {
    const html = markdownToHtml(
      ["| Agent | Runs |", "| --- | ---: |", "| ceo | 12 |", "| qa | 3 |"].join("\n"),
    );
    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toContain("ceo");
    expect(html).toContain("12");
  });

  it("does not mistake a paragraph containing a pipe for a table", () => {
    const html = markdownToHtml("use a | b for alternatives\nand carry on");
    expect(html).not.toContain("<table");
    expect(html).toContain("<p");
  });

  it("cannot be tricked into restoring forged code placeholders", () => {
    // Placeholders are NUL-wrapped; NULs are stripped from the source first, so
    // a body naming a placeholder slot gets no HTML restored into it.
    const nul = String.fromCharCode(0);
    const html = markdownToHtml(`${nul}C0${nul} plain <b>text</b>`);
    expect(html).not.toContain("<code");
    expect(html).toContain("&lt;b&gt;");
  });

  it("renders blockquotes and horizontal rules", () => {
    expect(markdownToHtml("> quoted")).toContain("<blockquote");
    expect(markdownToHtml("---")).toContain("<hr");
  });
});

describe("wrapEmailHtml", () => {
  it("produces a self-contained document with no remote asset", () => {
    const html = wrapEmailHtml("<p>hi</p>", "Sent by a Paperclip agent.");
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<p>hi</p>");
    expect(html).toContain("Sent by a Paperclip agent.");
    // A remote fetch would leak when and where the report was opened.
    expect(html).not.toMatch(/src="https?:/);
    expect(html).not.toContain("<link");
  });

  it("escapes the footer", () => {
    expect(wrapEmailHtml("<p>hi</p>", "<script>x</script>")).toContain("&lt;script&gt;");
  });
});
