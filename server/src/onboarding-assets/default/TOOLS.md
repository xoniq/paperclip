# Tools

This file is your durable tool knowledge base. Keep it current: every time you
discover a tool, verify an API schema, or get burned by a wrong assumption,
record the correction here so the next run starts smart instead of rediscovering
everything.

## Connected tools and MCP servers

Record every external tool you use. For each: how it is reached (Paperclip MCP
connection, CLI, REST), the exact tool/endpoint names, and the **verified**
required parameters. Date every correction.

| Tool / server | Access path | Key operations (verified params) | Last verified |
| ------------- | ----------- | -------------------------------- | ------------- |
| (name) | (MCP connection / CLI / REST) | (op + required params) | (date) |

Rules learned the hard way — keep these and add your own:

- **No one-off scripts for API calls a tool already covers.** If an MCP tool or
  documented endpoint exists, call it directly. One-off `fix_*.py` scripts rot,
  mislead future runs, and re-introduce solved bugs.
- **Verify writes.** After creating or updating a remote object, read it back
  and assert the fields you set actually landed. Silent-ignore APIs report
  success while dropping unknown fields.
- **Record schema corrections immediately.** When a parameter name turns out to
  be wrong, fix it in this file in the same run — not only in an issue comment
  where the next run will never see it.
