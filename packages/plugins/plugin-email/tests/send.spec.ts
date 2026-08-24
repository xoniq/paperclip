import { beforeEach, describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import type { TestHarness } from "@paperclipai/plugin-sdk";
import manifest from "../src/manifest.js";
import { parseConfig, type EmailConfig } from "../src/config.js";
import { sendEmail } from "../src/send.js";
import { readSendLog } from "../src/state.js";
import type { SmtpMessage, SmtpTransportFactory, SmtpTransportOptions } from "../src/smtp.js";

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const NOW = 1_800_000_000_000;

const RAW_CONFIG = {
  host: "smtp.example.com",
  port: 587,
  username: "bot",
  password: { type: "secret_ref", secretId: "secret-1" },
  fromAddress: "bot@example.com",
  fromName: "Paperclip",
  replyToAddress: "ops@example.com",
  allowedRecipients: ["jelle@example.com", "@team.example.org"],
  subjectPrefix: "[Paperclip]",
  maxPerHour: 3,
  maxPerDay: 5,
};

interface TransportSpy {
  sent: SmtpMessage[];
  options: SmtpTransportOptions[];
  closed: number;
  factory: SmtpTransportFactory;
}

/** A transport that records instead of connecting, with a scripted outcome. */
function createTransportSpy(
  outcome: { rejected?: string[]; throws?: unknown } = {},
): TransportSpy {
  const spy: TransportSpy = {
    sent: [],
    options: [],
    closed: 0,
    factory: () => ({ sendMail: async () => ({ messageId: "", accepted: [], rejected: [], response: "" }), verify: async () => {}, close: () => {} }),
  };

  spy.factory = (options) => {
    spy.options.push(options);
    return {
      async sendMail(message) {
        if (outcome.throws) throw outcome.throws;
        spy.sent.push(message);
        return {
          messageId: "<abc@example.com>",
          accepted: message.to,
          rejected: outcome.rejected ?? [],
          response: "250 OK",
        };
      },
      async verify() {},
      close() {
        spy.closed += 1;
      },
    };
  };

  return spy;
}

describe("sendEmail", () => {
  let harness: TestHarness;
  let config: EmailConfig;

  beforeEach(() => {
    harness = createTestHarness({ manifest });
    config = parseConfig(RAW_CONFIG);
  });

  it("sends, and takes the sender and reply-to from config rather than the caller", async () => {
    const spy = createTransportSpy();
    const outcome = await sendEmail({
      ctx: harness.ctx,
      companyId: COMPANY_ID,
      config,
      source: "agent",
      runId: "run-1",
      now: NOW,
      transportFactory: spy.factory,
      request: {
        to: ["jelle@example.com"],
        subject: "Weekly report",
        body: "## Summary\n\n- all good",
        // A prompt-injected attempt to impersonate someone. These keys are not
        // in the tool schema and must have no effect whatsoever.
        from: "ceo@example.com",
        replyTo: "attacker@evil.com",
      } as Record<string, unknown>,
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.messageId).toBe("<abc@example.com>");
    expect(spy.sent).toHaveLength(1);

    const message = spy.sent[0]!;
    expect(message.from).toBe('"Paperclip" <bot@example.com>');
    expect(message.replyTo).toBe("ops@example.com");
    expect(message.to).toEqual(["jelle@example.com"]);
    expect(message.subject).toBe("[Paperclip] Weekly report");
    // Both alternatives are present: raw markdown as text, rendered as HTML.
    expect(message.text).toContain("## Summary");
    expect(message.html).toContain("<h2");
    expect(spy.closed).toBe(1);
  });

  it("resolves the password through the secret provider at send time", async () => {
    const spy = createTransportSpy();
    await sendEmail({
      ctx: harness.ctx,
      companyId: COMPANY_ID,
      config,
      source: "agent",
      now: NOW,
      transportFactory: spy.factory,
      request: { to: ["jelle@example.com"], subject: "s", body: "b" },
    });
    // The harness stub returns `resolved:<ref>`; what matters is that the raw
    // config value never reaches the transport.
    expect(spy.options[0]?.password).toContain("resolved:");
    expect(spy.options[0]?.host).toBe("smtp.example.com");
  });

  it("refuses a recipient outside the allowlist without opening a connection", async () => {
    const spy = createTransportSpy();
    const outcome = await sendEmail({
      ctx: harness.ctx,
      companyId: COMPANY_ID,
      config,
      source: "agent",
      now: NOW,
      transportFactory: spy.factory,
      request: { to: ["attacker@evil.com"], subject: "s", body: "b" },
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("attacker@evil.com");
    expect(outcome.error).toContain("allowlist");
    expect(spy.options).toHaveLength(0);
  });

  it("refuses the whole send when only one of several recipients is disallowed", async () => {
    // A partial send would have the agent report success while someone silently
    // never heard from it.
    const spy = createTransportSpy();
    const outcome = await sendEmail({
      ctx: harness.ctx,
      companyId: COMPANY_ID,
      config,
      source: "agent",
      now: NOW,
      transportFactory: spy.factory,
      request: { to: ["jelle@example.com", "attacker@evil.com"], subject: "s", body: "b" },
    });

    expect(outcome.ok).toBe(false);
    expect(spy.sent).toHaveLength(0);
  });

  it("allowlist-checks cc as well as to", async () => {
    const spy = createTransportSpy();
    const outcome = await sendEmail({
      ctx: harness.ctx,
      companyId: COMPANY_ID,
      config,
      source: "agent",
      now: NOW,
      transportFactory: spy.factory,
      request: {
        to: ["jelle@example.com"],
        cc: ["attacker@evil.com"],
        subject: "s",
        body: "b",
      },
    });
    expect(outcome.ok).toBe(false);
    expect(spy.sent).toHaveLength(0);
  });

  it("rejects an address carrying a header terminator", async () => {
    const spy = createTransportSpy();
    const outcome = await sendEmail({
      ctx: harness.ctx,
      companyId: COMPANY_ID,
      config,
      source: "agent",
      now: NOW,
      transportFactory: spy.factory,
      request: {
        to: ["jelle@example.com\r\nBcc: everyone@example.com"],
        subject: "s",
        body: "b",
      },
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("not valid email addresses");
    expect(spy.sent).toHaveLength(0);
  });

  it("validates shape before anything else", async () => {
    const spy = createTransportSpy();
    const base = { ctx: harness.ctx, companyId: COMPANY_ID, config, source: "agent" as const, now: NOW, transportFactory: spy.factory };

    expect((await sendEmail({ ...base, request: { to: [], subject: "s", body: "b" } })).error).toContain("to must be");
    expect((await sendEmail({ ...base, request: { to: ["jelle@example.com"], subject: "  ", body: "b" } })).error).toContain("subject is required");
    expect((await sendEmail({ ...base, request: { to: ["jelle@example.com"], subject: "s", body: "" } })).error).toContain("body is required");
    expect(
      (await sendEmail({ ...base, request: { to: ["jelle@example.com"], subject: "x".repeat(201), body: "b" } })).error,
    ).toContain("at most 200");
    expect(spy.options).toHaveLength(0);
  });

  it("rejects malformed attachments and accepts valid ones", async () => {
    const spy = createTransportSpy();
    const base = { ctx: harness.ctx, companyId: COMPANY_ID, config, source: "agent" as const, now: NOW, transportFactory: spy.factory };

    const bad = await sendEmail({
      ...base,
      request: {
        to: ["jelle@example.com"],
        subject: "s",
        body: "b",
        attachments: [{ filename: "report.csv", contentBase64: "not base64!!" }],
      },
    });
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain("not valid base64");

    const good = await sendEmail({
      ...base,
      request: {
        to: ["jelle@example.com"],
        subject: "s",
        body: "b",
        attachments: [
          { filename: "../../etc/passwd", contentBase64: Buffer.from("a,b\n1,2").toString("base64") },
        ],
      },
    });
    expect(good.ok).toBe(true);
    // Path separators are scrubbed out of the filename.
    expect(spy.sent[0]?.attachments?.[0]?.filename).toBe("..-..-etc-passwd");
    expect(spy.sent[0]?.attachments?.[0]?.content.toString()).toBe("a,b\n1,2");
  });

  it("enforces the hourly rate limit and does not log the refusal", async () => {
    const spy = createTransportSpy();
    const send = (at: number) =>
      sendEmail({
        ctx: harness.ctx,
        companyId: COMPANY_ID,
        config,
        source: "agent",
        now: at,
        transportFactory: spy.factory,
        request: { to: ["jelle@example.com"], subject: "s", body: "b" },
      });

    expect((await send(NOW)).ok).toBe(true);
    expect((await send(NOW + 1000)).ok).toBe(true);
    expect((await send(NOW + 2000)).ok).toBe(true);

    const blocked = await send(NOW + 3000);
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toContain("rate limit");
    expect(spy.sent).toHaveLength(3);

    // The refusal must not itself land in the log — otherwise every retry would
    // extend its own window and the limit would never expire.
    const log = await readSendLog(harness.ctx, COMPANY_ID);
    expect(log).toHaveLength(3);
  });

  it("frees a slot once the oldest attempt ages out of the window", async () => {
    const spy = createTransportSpy();
    const send = (at: number) =>
      sendEmail({
        ctx: harness.ctx,
        companyId: COMPANY_ID,
        config,
        source: "agent",
        now: at,
        transportFactory: spy.factory,
        request: { to: ["jelle@example.com"], subject: "s", body: "b" },
      });

    await send(NOW);
    await send(NOW + 1000);
    await send(NOW + 2000);
    expect((await send(NOW + 60 * 60_000 + 1)).ok).toBe(true);
  });

  it("records a readable failure when the server refuses the connection", async () => {
    const spy = createTransportSpy({ throws: Object.assign(new Error("nope"), { code: "EAUTH", responseCode: 535 }) });
    const outcome = await sendEmail({
      ctx: harness.ctx,
      companyId: COMPANY_ID,
      config,
      source: "agent",
      now: NOW,
      transportFactory: spy.factory,
      request: { to: ["jelle@example.com"], subject: "s", body: "b" },
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("authentication failed");
    expect(spy.closed).toBe(1);

    const log = await readSendLog(harness.ctx, COMPANY_ID);
    expect(log[0]).toMatchObject({ ok: false });
    expect(harness.activity.at(-1)?.message).toContain("failed");
  });

  it("reports a partially refused envelope as a failure", async () => {
    const spy = createTransportSpy({ rejected: ["bot@team.example.org"] });
    const outcome = await sendEmail({
      ctx: harness.ctx,
      companyId: COMPANY_ID,
      config,
      source: "agent",
      now: NOW,
      transportFactory: spy.factory,
      request: { to: ["jelle@example.com", "bot@team.example.org"], subject: "s", body: "b" },
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("refused");
  });

  it("writes an activity entry with the metadata an operator needs", async () => {
    const spy = createTransportSpy();
    await sendEmail({
      ctx: harness.ctx,
      companyId: COMPANY_ID,
      config,
      source: "agent",
      agentId: "agent-1",
      runId: "run-1",
      now: NOW,
      transportFactory: spy.factory,
      request: { to: ["jelle@example.com"], subject: "Weekly report", body: "b" },
    });

    const entry = harness.activity.at(-1)!;
    expect(entry.message).toContain("jelle@example.com");
    expect(entry.entityType).toBe("email");
    expect(entry.entityId).toBe("<abc@example.com>");
    expect(entry.metadata).toMatchObject({
      ok: true,
      source: "agent",
      agentId: "agent-1",
      runId: "run-1",
      recipients: ["jelle@example.com"],
    });
  });

  it("renders with custom HTML template when configured for the company", async () => {
    const spy = createTransportSpy();
    const customConfig = parseConfig({
      ...RAW_CONFIG,
      htmlTemplate: `<div style="background: #111; color: #fff;"><h1>{{subject}}</h1><article>{{body}}</article><footer>{{footer}}</footer></div>`,
    });

    const outcome = await sendEmail({
      ctx: harness.ctx,
      companyId: COMPANY_ID,
      config: customConfig,
      source: "agent",
      runId: "run-42",
      now: NOW,
      transportFactory: spy.factory,
      request: {
        to: ["jelle@example.com"],
        subject: "Gamerbase Newsletter",
        body: "## Top News\n\n- Game update released!",
      },
    });

    expect(outcome.ok).toBe(true);
    expect(spy.sent).toHaveLength(1);
    const sentMessage = spy.sent[0]!;
    expect(sentMessage.html).toContain("<div style=\"background: #111; color: #fff;\">");
    expect(sentMessage.html).toContain("<h1>[Paperclip] Gamerbase Newsletter</h1>");
    expect(sentMessage.html).toContain("<article><h2");
    expect(sentMessage.html).toContain("Game update released!");
    expect(sentMessage.html).toContain("<footer>Sent automatically by a Paperclip agent (run run-42).</footer>");
  });
});
