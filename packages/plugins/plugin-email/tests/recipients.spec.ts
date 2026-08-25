import { describe, expect, it } from "vitest";
import {
  formatFrom,
  isAllowedRecipient,
  normalizeAllowlistEntry,
  parseAddress,
  resolveRecipients,
  sanitizeSubject,
} from "../src/recipients.js";

const CRLF = "\r\n";

describe("parseAddress", () => {
  it("accepts a plain address and lowercases it", () => {
    expect(parseAddress("Jelle@Example.COM")).toBe("jelle@example.com");
  });

  it("extracts the address from a display-name form", () => {
    expect(parseAddress("Jelle Posthuma <jelle@example.com>")).toBe("jelle@example.com");
  });

  it("rejects anything carrying a header terminator", () => {
    // The classic SMTP header injection: a second header smuggled into the
    // address. It must not be sanitized into something valid — it must fail.
    expect(parseAddress(`jelle@example.com${CRLF}Bcc: everyone@example.com`)).toBeNull();
    expect(parseAddress("jelle@example.com\nBcc: x@y.com")).toBeNull();
  });

  it("rejects lists, empty values, and non-strings", () => {
    expect(parseAddress("a@example.com, b@example.com")).toBeNull();
    expect(parseAddress("")).toBeNull();
    expect(parseAddress("   ")).toBeNull();
    expect(parseAddress(42)).toBeNull();
    expect(parseAddress(null)).toBeNull();
  });

  it("rejects addresses without a dotted domain", () => {
    expect(parseAddress("jelle@localhost")).toBeNull();
    expect(parseAddress("jelle")).toBeNull();
    expect(parseAddress("@example.com")).toBeNull();
  });

  it("rejects an absurdly long address", () => {
    expect(parseAddress(`${"a".repeat(400)}@example.com`)).toBeNull();
  });
});

describe("normalizeAllowlistEntry", () => {
  it("accepts an exact address", () => {
    expect(normalizeAllowlistEntry(" Jelle@Example.com ")).toBe("jelle@example.com");
  });

  it("accepts both domain spellings operators use", () => {
    expect(normalizeAllowlistEntry("@example.com")).toBe("@example.com");
    expect(normalizeAllowlistEntry("*@example.com")).toBe("@example.com");
  });

  it("rejects a bare domain", () => {
    // Ambiguous with a typo'd address, and guessing wrong would silently widen
    // the allowlist to everyone at that domain.
    expect(normalizeAllowlistEntry("example.com")).toBeNull();
  });

  it("rejects malformed entries", () => {
    expect(normalizeAllowlistEntry("@")).toBeNull();
    expect(normalizeAllowlistEntry("@localhost")).toBeNull();
    expect(normalizeAllowlistEntry("*")).toBeNull();
    expect(normalizeAllowlistEntry(`@exam${CRLF}ple.com`)).toBeNull();
  });

  it("trims surrounding whitespace, including a pasted trailing newline", () => {
    // Trailing whitespace is an operator typo, not an injection: the terminator
    // is gone from the result either way, so accepting it costs nothing.
    expect(normalizeAllowlistEntry(`@example.com${CRLF}`)).toBe("@example.com");
  });
});

describe("isAllowedRecipient", () => {
  const allowlist = ["jelle@example.com", "@team.example.org"];

  it("matches an exact entry", () => {
    expect(isAllowedRecipient("jelle@example.com", allowlist)).toBe(true);
  });

  it("matches any address at an allowed domain", () => {
    expect(isAllowedRecipient("anyone@team.example.org", allowlist)).toBe(true);
  });

  it("does not treat a domain entry as a suffix match on the whole address", () => {
    // "evil-team.example.org" must not match "@team.example.org".
    expect(isAllowedRecipient("x@evil-team.example.org", allowlist)).toBe(false);
    expect(isAllowedRecipient("x@team.example.org.attacker.com", allowlist)).toBe(false);
  });

  it("does not admit a subdomain of an allowed domain", () => {
    expect(isAllowedRecipient("x@sub.team.example.org", allowlist)).toBe(false);
  });

  it("fails closed on an empty allowlist", () => {
    expect(isAllowedRecipient("jelle@example.com", [])).toBe(false);
  });
});

describe("resolveRecipients", () => {
  const allowlist = ["jelle@example.com", "@team.example.org"];

  it("separates allowed, rejected, and unparseable inputs", () => {
    const result = resolveRecipients(
      ["jelle@example.com", "sales@other.com", "not-an-address", "bot@team.example.org"],
      allowlist,
    );
    expect(result.allowed).toEqual(["jelle@example.com", "bot@team.example.org"]);
    expect(result.rejected).toEqual(["sales@other.com"]);
    expect(result.unparseable).toEqual(["not-an-address"]);
  });

  it("collapses duplicates that differ only in case or display name", () => {
    const result = resolveRecipients(
      ["jelle@example.com", "JELLE@EXAMPLE.COM", "Jelle <jelle@example.com>"],
      allowlist,
    );
    expect(result.allowed).toEqual(["jelle@example.com"]);
  });

  it("admits any valid address when allowAnyRecipient is true", () => {
    const result = resolveRecipients(
      ["coldlead@target.com", "another@enterprise.io", "not-an-address"],
      [],
      true,
    );
    expect(result.allowed).toEqual(["coldlead@target.com", "another@enterprise.io"]);
    expect(result.rejected).toEqual([]);
    expect(result.unparseable).toEqual(["not-an-address"]);
  });
});

describe("sanitizeSubject", () => {
  it("strips header terminators and collapses whitespace", () => {
    expect(sanitizeSubject(`Weekly report${CRLF}Bcc: everyone@example.com`)).toBe(
      "Weekly report Bcc: everyone@example.com",
    );
    expect(sanitizeSubject("  spaced    out  ")).toBe("spaced out");
  });
});

describe("formatFrom", () => {
  it("returns a bare address when there is no display name", () => {
    expect(formatFrom("bot@example.com", null)).toBe("bot@example.com");
    expect(formatFrom("bot@example.com", "  ")).toBe("bot@example.com");
  });

  it("quotes and escapes the display name", () => {
    expect(formatFrom("bot@example.com", "Paperclip")).toBe('"Paperclip" <bot@example.com>');
    expect(formatFrom("bot@example.com", 'He said "hi"')).toBe(
      '"He said \\"hi\\"" <bot@example.com>',
    );
  });

  it("cannot be used to inject a header through the display name", () => {
    expect(formatFrom("bot@example.com", `Paperclip${CRLF}Bcc: x@y.com`)).toBe(
      '"Paperclip Bcc: x@y.com" <bot@example.com>',
    );
  });
});
