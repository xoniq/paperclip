import { beforeEach, describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import type { TestHarness, ToolResult } from "@paperclipai/plugin-sdk";
import manifest, { ACTION_SEND_TEST, DATA_OVERVIEW, TOOL_SEND_EMAIL } from "../src/manifest.js";
import plugin from "../src/worker.js";

// definePlugin returns { definition }; the lifecycle hooks live one level down.
const definition = plugin.definition;

const COMPANY_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_COMPANY_ID = "22222222-2222-4222-8222-222222222222";

const RAW_CONFIG = {
  host: "smtp.example.com",
  fromAddress: "bot@example.com",
  replyToAddress: "ops@example.com",
  allowedRecipients: ["jelle@example.com"],
  password: { type: "secret_ref", secretId: "secret-1" },
  username: "bot",
};

/**
 * These tests exercise the wiring, not the socket: every case here is one the
 * pipeline settles before a transport is ever constructed. The send path itself
 * is covered in send.spec.ts, where the transport is injectable.
 */
describe("worker", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = createTestHarness({ manifest });
    await definition.setup?.(harness.ctx);
    // Drop any config a previous test left in worker module scope.
    await definition.onConfigChanged?.({}, { companyId: COMPANY_ID });
    await definition.onConfigChanged?.({}, { companyId: OTHER_COMPANY_ID });
  });

  it("validates config through the same rules as the settings form", async () => {
    const bad = await definition.onValidateConfig?.({ host: "smtp.example.com" });
    expect(bad?.ok).toBe(false);

    const good = await definition.onValidateConfig?.(RAW_CONFIG);
    expect(good?.ok).toBe(true);
  });

  it("refuses to send for a company with no configuration", async () => {
    const result = await harness.executeTool<ToolResult>(
      TOOL_SEND_EMAIL,
      { to: ["jelle@example.com"], subject: "s", body: "b" },
      { companyId: COMPANY_ID },
    );
    expect(result.error).toContain("not configured");
  });

  it("drops the configuration when a save makes it invalid", async () => {
    await definition.onConfigChanged?.(RAW_CONFIG, { companyId: COMPANY_ID });
    expect((await harness.getData<{ configured: boolean }>(DATA_OVERVIEW, { companyId: COMPANY_ID })).configured).toBe(true);

    // Half-saved settings must disable sending rather than keep mailing with
    // the values the operator was in the middle of replacing.
    await definition.onConfigChanged?.({ ...RAW_CONFIG, allowedRecipients: [] }, { companyId: COMPANY_ID });
    const overview = await harness.getData<{ configured: boolean }>(DATA_OVERVIEW, { companyId: COMPANY_ID });
    expect(overview.configured).toBe(false);
  });

  it("keeps company configurations separate", async () => {
    await definition.onConfigChanged?.(RAW_CONFIG, { companyId: COMPANY_ID });

    // The second company was never configured, so its agents cannot borrow the
    // first company's server, sender, or allowlist.
    const result = await harness.executeTool<ToolResult>(
      TOOL_SEND_EMAIL,
      { to: ["jelle@example.com"], subject: "s", body: "b" },
      { companyId: OTHER_COMPANY_ID },
    );
    expect(result.error).toContain("not configured");
  });

  it("rejects a non-allowlisted recipient through the tool", async () => {
    await definition.onConfigChanged?.(RAW_CONFIG, { companyId: COMPANY_ID });
    const result = await harness.executeTool<ToolResult>(
      TOOL_SEND_EMAIL,
      { to: ["attacker@evil.com"], subject: "s", body: "b" },
      { companyId: COMPANY_ID },
    );
    expect(result.error).toContain("allowlist");
  });

  it("exposes a config summary that carries no secret material", async () => {
    await definition.onConfigChanged?.(RAW_CONFIG, { companyId: COMPANY_ID });
    const overview = await harness.getData<Record<string, unknown>>(DATA_OVERVIEW, {
      companyId: COMPANY_ID,
    });

    expect(overview.configured).toBe(true);
    expect(JSON.stringify(overview)).not.toContain("secret-1");
    expect(overview.config).toMatchObject({
      host: "smtp.example.com",
      hasPassword: true,
      passwordIsSecretRef: true,
      allowedRecipients: ["jelle@example.com"],
    });
    expect(overview.budget).toMatchObject({ hourUsed: 0, dayUsed: 0 });
  });

  it("refuses a test send with no recipient chosen", async () => {
    await definition.onConfigChanged?.(RAW_CONFIG, { companyId: COMPANY_ID });
    const result = await harness.performAction<{ ok: boolean; error?: string }>(
      ACTION_SEND_TEST,
      { to: "" },
      { companyId: COMPANY_ID },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("Pick a recipient");
  });

  it("reports degraded health until a company is configured", async () => {
    expect((await definition.onHealth?.())?.status).toBe("degraded");
    await definition.onConfigChanged?.(RAW_CONFIG, { companyId: COMPANY_ID });
    expect((await definition.onHealth?.())?.status).toBe("ok");
  });
});
