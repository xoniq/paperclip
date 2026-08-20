# @paperclipai/plugin-email

Gives Paperclip agents one tool — `send_email` — that sends through your own SMTP server.

The point of the plugin is not the sending. Sending is twenty lines of nodemailer. The point is everything around it: an agent that can email is an agent that can be talked into emailing, because tool arguments are model output and model output is reachable by anything the agent read during the run — an issue comment, a web page, a file in the repo. So the operator fixes the sender, the operator fixes the recipient list, and the agent gets to choose only what to say.

## What an agent can and cannot do

| | Chosen by |
|---|---|
| Recipients (`to`, `cc`) | Agent — but only from the operator's allowlist |
| Subject and body | Agent |
| Attachments | Agent (max 5, 10MB total) |
| **From address and display name** | **Operator only** |
| **Reply-to** | **Operator only** |
| **How often** | **Operator only** (per-company rate limit) |

`from` and `replyTo` are not in the tool's parameter schema, and the schema is `additionalProperties: false`. Passing them does nothing — there is a test that proves it.

## Setup

1. Install the plugin:

```bash
paperclipai plugin install packages/plugins/plugin-email
```

2. Open **Company settings → Email** and fill in:

- **SMTP host / port** — 587 with STARTTLS is the usual pairing; 465 needs "Implicit TLS" on.
- **Username / password** — pick an existing secret in the picker, or paste the password once and it is stored as a secret on save. Leave both empty only for a relay that authenticates by IP.
- **From address**, **From display name**, **Reply-to** — reply-to is required. A report nobody can answer is a dead end.
- **Allowed recipients** — exact addresses (`jelle@example.com`) or whole domains (`@example.com`). An empty list blocks every send, and the config will not validate without at least one entry.
- **Max per hour / per day** — defaults are 20 and 100, per company.

3. Hit **Send test email** on the settings page. It runs the same pipeline an agent does — same allowlist, same rate limit, same activity-log entry — so a passing test proves the thing agents will actually use.

## Using it from a routine

The body is Markdown. Headings, bold, italic, code, lists, links, and pipe tables render to HTML; the raw Markdown goes out as the plain-text alternative, so both kinds of mail client get something readable.

A routine prompt that ends like this is enough:

> Compile the weekly status for this project. Then send it with `send_email` to jelle@example.com, subject "Weekly status — <project>", body in Markdown with a table of issues closed this week.

## What it writes down

Every attempt — success or failure — produces:

- an **activity log** entry with the message-id, recipients, agent, run, and any error;
- an entry in the plugin's own **send log**, shown on the settings page and used for rate limiting.

## Design notes

**The allowlist fails closed.** An empty list is a validation error, not a permissive default. A half-saved config drops the company out of the worker's map entirely rather than keeping the previous values, so partially edited settings disable sending instead of quietly mailing with what the operator was in the middle of replacing.

**A partial send is treated as a failure.** If one of four recipients is not allowlisted, the whole call fails and names the offender. "We mailed three of your four recipients" is a worse outcome for the agent to report than a clean error it can act on.

**Rate limits count failures too.** The case the limit exists for is an agent looping against a refusing server, and counting only successes would let that run forever. Refusals *by* the limiter are deliberately not logged — otherwise each retry would extend its own window and a temporary limit would become permanent.

**Header injection is rejected, not sanitized.** An address carrying a CR, LF, or line separator fails. A "cleaned" address is not an address the operator ever allowlisted.

**Raw HTML in the body is escaped.** Only `http`, `https`, and `mailto` links survive; everything else keeps its label and loses its href. The rendered mail embeds no remote asset, so a client that blocks remote content still renders it correctly and opening the report leaks nothing.

**Secrets are resolved per send and never cached.** The settings page payload is built field by field rather than spread, so a secret added to the config type later cannot ride along into the UI by default.

**No `http.outbound` capability.** SMTP is a raw TCP/TLS socket opened by nodemailer inside the worker, not a host-mediated fetch, so the host cannot audit the connection itself. The audit trail this plugin offers is the activity-log entry per send.

**The worker bundle needs a `require` banner.** nodemailer is CommonJS, and esbuild's ESM output rewrites the requires it cannot resolve statically into a shim that throws at *import* time — the worker would die on startup, not at first send. `esbuild.config.mjs` puts a real `createRequire` in scope so that shim delegates instead of throwing. Do not remove it without running the SMTP round-trip check.

## Development

```bash
pnpm --filter @paperclipai/plugin-email build
pnpm --filter @paperclipai/plugin-email test
pnpm --filter @paperclipai/plugin-email typecheck
```

`pnpm dev` runs esbuild in watch mode; Paperclip reloads the worker when `dist/` changes.

The SMTP layer sits behind an injectable `SmtpTransportFactory`, so `tests/send.spec.ts` exercises the full pipeline — allowlist, limits, logging, error mapping — without a socket. `tests/worker.spec.ts` covers the wiring up to the point a transport would be built.

## Known gaps

- **No delivery confirmation beyond the SMTP handshake.** A `250 OK` means your server accepted the message, not that it arrived. Bounces land in the reply-to mailbox, not in Paperclip.
- **No approval gate.** Sending is allowlist- and rate-limited, not human-approved. If a send should require a person to say yes, that needs `approvals.*` wiring this version does not have.
- **Attachments must be passed inline as base64.** The tool cannot read a file out of the agent's workspace, so a large generated report has to be base64'd into the call.
- **Rate limiting is per company and slightly racy.** Two sends landing in the same instant can both pass the check, so the limit is a bound rather than a hard cap.
