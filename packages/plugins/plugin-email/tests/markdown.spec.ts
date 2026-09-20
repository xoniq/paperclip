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
    expect(html).toContain("<div>use a | b for alternatives");
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

  it("preserves line breaks in multi-line address blocks and signatures with <br />", () => {
    const address = [
      "Verzendadres:",
      "GamerBase, t.a.v. Jelle Posthuma",
      "Grettingalaan 42",
      "8862 ZD Harlingen",
    ].join("\n");

    const html = markdownToHtml(address);
    expect(html).toContain("Verzendadres:<br />");
    expect(html).toContain("GamerBase, t.a.v. Jelle Posthuma<br />");
    expect(html).toContain("Grettingalaan 42<br />");
    expect(html).toContain("8862 ZD Harlingen</div>");
  });

  it("supports CommonMark trailing backslash hard line break", () => {
    const html = markdownToHtml("Line one\\\nLine two");
    expect(html).toContain("Line one<br />");
    expect(html).toContain("Line two");
    expect(html).not.toContain("Line one\\");
  });

  it("applies email-safe paragraph spacing across multiple paragraphs in Gmail-compatible format", () => {
    const markdown = ["Alinea 1", "", "Alinea 2"].join("\n");
    const html = markdownToHtml(markdown);
    expect(html).toContain("<div>Alinea 1</div>");
    expect(html).toContain("<div><br></div>");
    expect(html).toContain("<div>Alinea 2</div>");
  });
});

describe("wrapEmailHtml", () => {
  it("produces a clean Gmail-compatible container with no remote asset", () => {
    const html = wrapEmailHtml("<div>hi</div>", "Sent by a Paperclip agent.");
    expect(html).toContain('dir="ltr"');
    expect(html).toContain("<div>hi</div>");
    expect(html).toContain("Sent by a Paperclip agent.");
    // A remote fetch would leak when and where the report was opened.
    expect(html).not.toMatch(/src="https?:/);
    expect(html).not.toContain("<link");
  });

  it("escapes the footer", () => {
    expect(wrapEmailHtml("<div>hi</div>", "<script>x</script>")).toContain("&lt;script&gt;");
  });

  it("interpolates into custom HTML template with {{body}}, {{subject}}, and {{footer}}", () => {
    const template = `
      <div class="email-brand">
        <h1>{{subject}}</h1>
        <main>{{body}}</main>
        <footer>{{footer}}</footer>
      </div>
    `;
    const result = wrapEmailHtml("<p>Body content</p>", "Footer note", template, "Welcome & hello");
    expect(result).toContain("<h1>Welcome &amp; hello</h1>");
    expect(result).toContain("<main><p>Body content</p></main>");
    expect(result).toContain("<footer>Footer note</footer>");
  });

  it("supports [body], [subject], and [footer] placeholder tags in custom templates", () => {
    const template = `<div class="gamerbase"><h2>[subject]</h2><div>[body]</div><small>[footer]</small></div>`;
    const result = wrapEmailHtml("<p>Gamer news</p>", "Automated footer", template, "Daily News");
    expect(result).toContain("<h2>Daily News</h2>");
    expect(result).toContain("<div><p>Gamer news</p></div>");
    expect(result).toContain("<small>Automated footer</small>");
  });

  it("renders a multi-paragraph outreach draft to clean Gmail-compatible HTML", () => {
    const markdown = [
      "Alinea 1. Dit is de eerste alinea van de proef.",
      "",
      "Alinea 2. Hiervoor staat een gewone witregel in de Markdown.",
      "Alinea 3, regel A.  ",
      "Alinea 3, regel B na een harde regelafbreking.",
      "**Vet**, *cursief* en een [link met tekst](https://gamerbase.nl/press).",
      "",
      "- lijstitem A",
      "- lijstitem B",
      "",
      "Slotalinea.",
      "",
      "Jelle Posthuma  ",
      "Editor in chief, GamerBase",
    ].join("\n");

    const html = wrapEmailHtml(markdownToHtml(markdown), null);
    expect(html).toContain('<div dir="ltr"');
    expect(html).toContain("<div>Alinea 1. Dit is de eerste alinea van de proef.</div>");
    expect(html).toContain("<div><br></div>");
    expect(html).toContain("<div>Alinea 2. Hiervoor staat een gewone witregel in de Markdown.<br />\nAlinea 3, regel A.<br />");
    expect(html).toContain("<strong>Vet</strong>, <em>cursief</em> en een <a href=\"https://gamerbase.nl/press\"");
    expect(html).toContain("<ul style=\"margin:8px 0 16px;padding-left:22px;\">");
    expect(html).toContain("<div>Slotalinea.</div>");
    expect(html).toContain("<div>Jelle Posthuma<br />\nEditor in chief, GamerBase</div>");
    expect(html).not.toContain("<p style=");
    expect(html).not.toContain("<!doctype html>");
  });
});
