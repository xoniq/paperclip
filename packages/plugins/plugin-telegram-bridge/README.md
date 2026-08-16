# @paperclipai/plugin-telegram-bridge

Run your company from Telegram.

Every conversation is an issue thread. Your Telegram messages become
human-attributed issue comments — which wake the assigned agent exactly the way
a comment in the web app does — and the agent's comments, approvals, decisions,
failures, and budget stops come back to the chat they belong to.

## The two lanes

| Telegram | Paperclip |
| --- | --- |
| A thread you just talk in | A standing issue that is never closed |
| `/new <title>` | A new issue, plus its own topic in a forum group |
| Any message in a task topic | A comment on that task, which wakes the assignee |
| Agent replies and status changes | Relayed back into the same thread |
| Approvals and confirmations | Inline Approve / Reject buttons |

The standing lane exists so you do not have to invent a task before you can ask
a question. Ask the agent to start a task and it will — it has API access during
its run like any other invocation.

## Commands

```
/new <title>   start a task (its own topic in a forum group)
/status        status of this thread's task
/tasks         open tasks assigned to the agent
/done          close this thread's task
/pending       approvals waiting on you, with buttons
/here          send untargeted alerts to this thread
/whoami        your Telegram user ID (needed for the allowlist)
/help          this list
```

You do not need a command to talk — plain messages go straight through.

## What comes back to you

- **Agent comments**, in full. Markdown is converted to Telegram's HTML subset
  and split across messages with code fences kept intact.
- **Status changes** on mapped issues (`relayStatusChanges`).
- **Approvals**, as buttons. Tapping decides the approval attributed to your
  Paperclip user; the host re-verifies that identity independently
  (`relayApprovals`).
- **Confirmation cards** the agent raises mid-run — same buttons. Questions and
  multi-select cards are announced and answered by replying in the thread.
- **Failed runs and budget stops** (`relayAlerts`), sent to the notification
  chat, or to the last thread you spoke in if none is configured.

## Setup

**1. Create the bot.** Message [@BotFather](https://t.me/BotFather), run
`/newbot`, keep the token.

Then turn off privacy mode so the bot can see ordinary group messages:
`/setprivacy` → pick the bot → **Disable**. Without this the bot only receives
messages that start with `/`.

**2. Store the token as a secret.** Create a secret in Paperclip and bind it to
the plugin's `botToken` field. A literal token works but is flagged as a warning
— the config row is readable to anyone with operator access.

**3. Find your Telegram user ID.** Install the plugin, send `/whoami` — or use
[@userinfobot](https://t.me/userinfobot) — and put the number in
`allowedTelegramUserIds`. **This is the security boundary.** The bridge refuses
to start with an empty allowlist: anyone who finds your bot could otherwise
drive the agent, spend its budget, and approve its approvals.

**4. Set `operatorUserId`** to your Paperclip user ID. Inbound messages and
button decisions are attributed to that identity, and the host independently
verifies it is an active human member of the company — a plugin cannot forge
attribution.

**5. Pick the agent.** Leave `agentId` empty to use the first non-terminated
agent with role `agentRole` (default `ceo`), or pin an explicit `agentId`.

**6. For "new task = new chat", use a forum supergroup.** Enable Topics in the
group settings and make the bot an admin with *Manage Topics*. `/new` then opens
a real topic per task. In a plain chat everything shares one thread and `/new`
takes over the current one.

### Transport

`polling` (default) needs no public URL — the worker long-polls `getUpdates`.
This is the right choice for a self-hosted instance.

`webhook` is for a publicly reachable Paperclip. Set `webhookSecretToken` to a
random string, bind it as a secret, and register the endpoint with Telegram:

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://<your-paperclip-host>/api/plugins/<pluginId>/webhooks/telegram" \
  -d "secret_token=<the same random string>" \
  -d "allowed_updates=[\"message\",\"edited_message\",\"callback_query\"]"
```

The webhook route takes no session, so that secret token is the only thing
between the internet and your agent's inbox. The bridge drops any request whose
`X-Telegram-Bot-Api-Secret-Token` header does not match, and de-duplicates
redelivered updates so a Telegram retry cannot post the same message twice.

## Design notes

**Loop prevention.** A relayed message must not bounce back. Plugin-authored
mutations carry `sourcePluginKey` in their activity details, so the outbound
handler drops exactly this plugin's own comments — and nothing else. Comments
you write in the web UI still reach Telegram.

**Full comment bodies.** The `issue.comment.created` event carries only a
120-character `bodySnippet`, so the relay reads the comment back through
`ctx.issues.listComments` before sending.

**Closed tasks.** Commenting on a `done` or `cancelled` issue is a silent no-op
in the host — no assignee gets woken. The bridge reopens the issue to `todo`
first, so a follow-up in an old topic actually reaches the agent.

**Decision buttons.** Telegram caps `callback_data` at 64 bytes, which a company
plus issue plus interaction id blows past. A button carries a short opaque token
and the target lives in plugin state, so callback data cannot be forged by
editing it — an unknown token resolves to nothing. The token is consumed before
the host call, so a double-tap cannot decide twice.

**Interactions have no event.** Agents raise decision cards alongside a comment,
so a comment landing on a mapped issue is the moment the bridge checks for
pending ones. Announced ids are remembered per issue so later comments do not
repost the same buttons.

**Single tenant.** `multiCompanyConfig` is deliberately not set: one bot token
maps to one company, and the host fails closed if a second company's config
arrives. A worker silently switching companies would relay one company's work
into another's chat.

**Poll offset.** The update offset is persisted before each update is handled,
not after. A message that throws must not replay forever and wedge the loop
behind it.

**Message formatting.** Long messages are split on the Markdown source (not the
rendered HTML) so code fences stay balanced across the split. If Telegram still
rejects the entities, the bridge retries the chunk as plain text — a formatting
miss is better than a lost message. Rate-limit responses are retried once
honouring `retry_after`, because a split answer is exactly the shape that trips
Telegram's per-chat limit.

## Development

```bash
pnpm --filter @paperclipai/plugin-telegram-bridge build
pnpm --filter @paperclipai/plugin-telegram-bridge test
pnpm --filter @paperclipai/plugin-telegram-bridge typecheck
```

Install into a running local instance:

```bash
pnpm paperclipai plugin install packages/plugins/plugin-telegram-bridge
```

## Known gaps

- Files stay in Telegram. A photo, voice note, or document is recorded in the
  thread as a labelled line with its caption, but the bytes are not uploaded —
  the host exposes no attachment-write API to plugins.
- `ask_user_questions` and checkbox cards are announced but answered by replying
  in the thread, not by tapping; only yes/no shapes map onto two buttons.
- One agent per bot. Talking to a second agent means a second bot and a second
  plugin install.
- The standing issue accumulates comments indefinitely. The agent's own memory
  comes from its adapter session, so this costs nothing at runtime, but you may
  want to close it periodically and let it recreate.
