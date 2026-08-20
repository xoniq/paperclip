/**
 * Address handling and allowlist matching.
 *
 * Everything in this file treats its input as hostile. Recipient addresses
 * reach the tool as model output, and model output is reachable by anything the
 * agent read during the run — an issue comment, a web page, a repository file.
 * So the rules here are deliberately narrow: parse strictly, reject anything
 * ambiguous, and never let a header terminator through.
 */

/**
 * Characters that end a header line. An address or subject containing one of
 * these could inject extra headers (Bcc:, Content-Type:) into the message —
 * the classic SMTP header-injection bug. Anything carrying one is rejected
 * outright rather than sanitized, because a "cleaned" address is not an address
 * the operator ever allowlisted.
 */
const HEADER_TERMINATORS = /[\r\n\u2028\u2029\u0000]/;

/**
 * Global variant, for the two places that scrub rather than reject. Without the
 * `g` flag a `\r\n` pair loses only its `\r`, leaving the newline — and the
 * newline is the half that ends the header.
 */
const HEADER_TERMINATORS_GLOBAL = /[\r\n\u2028\u2029\u0000]/g;

/**
 * Pragmatic address shape: a local part without spaces or angle brackets, an
 * `@`, and a dotted domain. Not RFC 5322 — that grammar accepts quoted local
 * parts and comments that no operator types and that only widen the attack
 * surface here.
 */
const ADDRESS_PATTERN = /^[^\s@<>,;"'\\]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

/**
 * Extract a bare address from either `user@example.com` or
 * `Jelle <jelle@example.com>`.
 *
 * The display name is dropped rather than preserved: it is free text from the
 * model, it would have to be escaped into the header anyway, and it buys the
 * recipient nothing that the from-name does not already give them.
 *
 * Returns null when the input is not a single, unambiguous address.
 */
export function parseAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 320) return null;
  if (HEADER_TERMINATORS.test(trimmed)) return null;

  const angled = trimmed.match(/<([^<>]*)>\s*$/);
  const candidate = (angled ? angled[1] : trimmed).trim().toLowerCase();

  if (!ADDRESS_PATTERN.test(candidate)) return null;
  return candidate;
}

/**
 * Normalize one allowlist entry to either an exact lowercased address or a
 * `@domain` suffix pattern.
 *
 * `*@example.com` is accepted as a synonym for `@example.com` because that is
 * how operators habitually write it. A bare `example.com` is rejected: it is
 * indistinguishable from a typo'd address, and guessing wrong here silently
 * widens the allowlist to an entire domain.
 */
export function normalizeAllowlistEntry(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0 || HEADER_TERMINATORS.test(trimmed)) return null;

  const domainPattern = trimmed.startsWith("*@")
    ? trimmed.slice(1)
    : trimmed.startsWith("@")
      ? trimmed
      : null;

  if (domainPattern != null) {
    const domain = domainPattern.slice(1);
    // Reuse the address grammar for the domain half by testing a probe address,
    // so a domain entry can never be looser than the addresses it admits.
    return ADDRESS_PATTERN.test(`probe@${domain}`) ? `@${domain}` : null;
  }

  return ADDRESS_PATTERN.test(trimmed) ? trimmed : null;
}

/** True when `address` (already normalized) is admitted by the allowlist. */
export function isAllowedRecipient(address: string, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0) return false;
  const domain = address.slice(address.indexOf("@"));
  return allowlist.some((entry) => (entry.startsWith("@") ? entry === domain : entry === address));
}

export interface RecipientResolution {
  /** Addresses that parsed and passed the allowlist. */
  allowed: string[];
  /** Inputs that did not parse as a single address, verbatim for the error message. */
  unparseable: string[];
  /** Addresses that parsed but are not allowlisted. */
  rejected: string[];
}

/**
 * Resolve a list of raw recipient inputs against the allowlist.
 *
 * Duplicates collapse, order is preserved. The caller decides what to do with a
 * partial result — this plugin refuses the whole send, because "we mailed three
 * of your four recipients" is a worse outcome than a clean failure the agent
 * can report.
 */
export function resolveRecipients(
  values: readonly unknown[],
  allowlist: readonly string[],
): RecipientResolution {
  const allowed: string[] = [];
  const unparseable: string[] = [];
  const rejected: string[] = [];

  for (const value of values) {
    const address = parseAddress(value);
    if (address == null) {
      unparseable.push(typeof value === "string" ? value : JSON.stringify(value) ?? String(value));
      continue;
    }
    if (!isAllowedRecipient(address, allowlist)) {
      if (!rejected.includes(address)) rejected.push(address);
      continue;
    }
    if (!allowed.includes(address)) allowed.push(address);
  }

  return { allowed, unparseable, rejected };
}

/**
 * Strip anything that could break out of the Subject header, and collapse the
 * whitespace a multi-line Markdown heading would otherwise leave behind.
 */
export function sanitizeSubject(value: string): string {
  return value.replace(HEADER_TERMINATORS_GLOBAL, " ").replace(/\s+/g, " ").trim();
}

/** Render an RFC 5322 `From` value, quoting the display name when present. */
export function formatFrom(address: string, displayName: string | null): string {
  const name = displayName == null
    ? ""
    : displayName.replace(HEADER_TERMINATORS_GLOBAL, " ").replace(/\s+/g, " ").trim();
  if (name.length === 0) return address;
  return `"${name.replace(/(["\\])/g, "\\$1")}" <${address}>`;
}
