# Tools

This file is your durable tool knowledge base. Keep it current: every time you
discover a tool, verify an API schema, or get burned by a wrong assumption,
record the correction here so the next run starts smart instead of rediscovering
everything. Stale or missing entries here cost real tokens and real mistakes.

## Team roster (fill in on first run, keep current)

Your run context includes a "Company agent roster" section with every
colleague's stable agent id. Pin the roster here once so it is available even
without task context, and update it when agents are hired or terminated:

| Agent | Role | Agent ID | Notes |
| ----- | ---- | -------- | ----- |
| (name) | (role) | (uuid) | (specialty, adapter quirks) |

Agent ids never change. Do not re-fetch `GET /api/companies/{companyId}/agents`
on every heartbeat — use the roster above or the task-context section, and fetch
only when someone is genuinely missing.

## Connected tools and MCP servers

Record every external tool your company uses. For each: how it is reached
(Paperclip MCP connection, CLI, REST), the exact tool/endpoint names, and the
**verified** required parameters. Mark schema facts you have confirmed against a
real response, and date corrections.

| Tool / server | Access path | Key operations (verified params) | Last verified |
| ------------- | ----------- | -------------------------------- | ------------- |
| (e.g. Red CMS) | MCP connection "..." | (e.g. `blog_create_entry` requires `mediaId: <int>`) | (date) |

Rules learned the hard way — keep these and add your own:

- **No one-off scripts for API calls a tool already covers.** If an MCP tool or
  documented endpoint exists, call it directly. One-off `fix_*.py` scripts rot,
  mislead future runs, and re-introduce solved bugs.
- **Verify writes.** After creating or updating a remote object, read it back
  and assert the fields you set actually landed. Silent-ignore APIs report
  success while dropping unknown fields.
- **Record schema corrections immediately.** When a parameter name turns out to
  be wrong, fix it in this file (and in any playbook that mentions it) in the
  same run — not in an issue comment where the next run will never see it.
