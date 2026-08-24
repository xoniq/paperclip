import { describe, expect, it } from "vitest";
import { parseConfig, validateConfig } from "../src/config.js";
import manifest, { TOOL_SEND_EMAIL } from "../src/manifest.js";

const VALID = {
  host: "smtp.example.com",
  fromAddress: "bot@example.com",
  replyToAddress: "ops@example.com",
  allowedRecipients: ["jelle@example.com"],
  password: { type: "secret_ref", secretId: "secret-1" },
  username: "bot",
};

describe("parseConfig", () => {
  it("applies defaults", () => {
    const config = parseConfig(VALID);
    expect(config.port).toBe(587);
    expect(config.secure).toBe(false);
    expect(config.fromName).toBe("Paperclip");
    expect(config.maxPerHour).toBe(20);
    expect(config.maxPerDay).toBe(100);
    expect(config.rejectUnauthorized).toBe(true);
  });

  it("accepts numbers pasted as strings", () => {
    const config = parseConfig({ ...VALID, port: "465", maxPerHour: "5" });
    expect(config.port).toBe(465);
    expect(config.maxPerHour).toBe(5);
  });

  it("falls back to the default for a nonsensical number", () => {
    expect(parseConfig({ ...VALID, port: -1 }).port).toBe(587);
    expect(parseConfig({ ...VALID, maxPerHour: "abc" }).maxPerHour).toBe(20);
  });

  it("only turns TLS verification off on an explicit false", () => {
    expect(parseConfig({ ...VALID, rejectUnauthorized: "no" }).rejectUnauthorized).toBe(true);
    expect(parseConfig({ ...VALID, rejectUnauthorized: false }).rejectUnauthorized).toBe(false);
  });

  it("normalizes and de-duplicates the allowlist", () => {
    const config = parseConfig({
      ...VALID,
      allowedRecipients: [" Jelle@Example.com ", "JELLE@example.com", "*@team.example.org", "junk"],
    });
    expect(config.allowedRecipients).toEqual(["jelle@example.com", "@team.example.org"]);
  });

  it("strips a display name from the sender addresses", () => {
    const config = parseConfig({
      ...VALID,
      fromAddress: "Paperclip Bot <bot@example.com>",
      replyToAddress: "Ops <ops@example.com>",
    });
    expect(config.fromAddress).toBe("bot@example.com");
    expect(config.replyToAddress).toBe("ops@example.com");
  });
});

describe("validateConfig", () => {
  it("accepts a complete config", () => {
    const result = validateConfig(VALID);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("fails closed on an empty allowlist", () => {
    // The configuration where a prompt injection gets to pick the recipient
    // must not be reachable by leaving a field blank.
    const result = validateConfig({ ...VALID, allowedRecipients: [] });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("allowedRecipients is empty");
  });

  it("requires host, sender, and reply-to", () => {
    const result = validateConfig({ allowedRecipients: ["a@example.com"] });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("host is required");
    expect(result.errors.join(" ")).toContain("fromAddress is required");
    expect(result.errors.join(" ")).toContain("replyToAddress is required");
  });

  it("names allowlist entries it could not parse", () => {
    const result = validateConfig({ ...VALID, allowedRecipients: ["example.com"] });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("example.com");
  });

  it("warns about an inline password but does not block on it", () => {
    const result = validateConfig({ ...VALID, password: "hunter2" });
    expect(result.ok).toBe(true);
    expect(result.warnings.join(" ")).toContain("literal string");
  });

  it("validates htmlTemplate contains a body placeholder", () => {
    const validWithDoubleBraces = validateConfig({
      ...VALID,
      htmlTemplate: "<html><body>{{body}}</body></html>",
    });
    expect(validWithDoubleBraces.ok).toBe(true);

    const validWithBrackets = validateConfig({
      ...VALID,
      htmlTemplate: "<html><body>[body]</body></html>",
    });
    expect(validWithBrackets.ok).toBe(true);

    const invalid = validateConfig({
      ...VALID,
      htmlTemplate: "<html><body>No placeholder here</body></html>",
    });
    expect(invalid.ok).toBe(false);
    expect(invalid.errors.join(" ")).toContain("htmlTemplate must contain {{body}} or [body]");
  });

  it("warns about a port/TLS mismatch and about disabled certificate checks", () => {
    expect(validateConfig({ ...VALID, port: 465 }).warnings.join(" ")).toContain("implicit TLS");
    expect(validateConfig({ ...VALID, rejectUnauthorized: false }).warnings.join(" ")).toContain(
      "unauthenticated",
    );
  });
});

describe("manifest", () => {
  it("declares the send tool and the capabilities the worker actually uses", () => {
    expect(manifest.tools?.map((tool) => tool.name)).toEqual([TOOL_SEND_EMAIL]);
    for (const capability of [
      "agent.tools.register",
      "secrets.read-ref",
      "plugin.state.read",
      "plugin.state.write",
      "activity.log.write",
      "instance.settings.register",
      "ui.action.register",
    ]) {
      expect(manifest.capabilities).toContain(capability);
    }
  });

  it("keeps the sender out of the tool's parameter schema", () => {
    // If an agent could name the sender, the fixed-from guarantee would be a
    // comment rather than a control.
    const schema = manifest.tools?.[0]?.parametersSchema as {
      properties: Record<string, unknown>;
      additionalProperties?: boolean;
    };
    expect(Object.keys(schema.properties)).toEqual(["to", "cc", "subject", "body", "attachments"]);
    expect(schema.additionalProperties).toBe(false);
  });

  it("declares the password field so the settings UI renders a secret picker", () => {
    const password = (manifest.instanceConfigSchema as {
      properties: Record<string, { type?: unknown; format?: string }>;
    }).properties.password;
    expect(password?.format).toBe("secret-ref");
    // Both shapes must be accepted or the host rejects every picked secret.
    expect(password?.type).toEqual(["string", "object"]);
  });
});
