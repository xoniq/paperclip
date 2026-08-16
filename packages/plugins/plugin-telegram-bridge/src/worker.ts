import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { createBridge, type Bridge } from "./bridge.js";
import {
  parseConfig,
  resolveBotToken,
  resolveWebhookSecret,
  validateConfig,
  type BridgeConfig,
} from "./config.js";
import {
  getUpdateOffset,
  markUpdateSeen,
  setUpdateOffset,
  wasUpdateSeen,
} from "./mapping.js";
import { WEBHOOK_ENDPOINT_KEY } from "./manifest.js";
import { createTelegramClient, TelegramApiError, type TelegramUpdate } from "./telegram.js";

/**
 * Telegram long-poll hold time.
 *
 * The host caps an outbound plugin fetch at 30s and the worker RPC round trip at
 * the same 30s, so a 25s hold left only five seconds for network latency and
 * two JSON hops. Whenever that budget was exceeded the poll failed and the loop
 * backed off, turning an idle chat into a stuttering one. 20s keeps a full ten
 * seconds of headroom under both ceilings.
 */
const LONG_POLL_TIMEOUT_SECONDS = 20;

/** Backoff bounds for a failing poll loop, so an outage does not hammer the API. */
const MIN_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;

interface RuntimeState {
  companyId: string;
  config: BridgeConfig;
  bridge: Bridge;
}

// One worker process serves one plugin, so module scope is the plugin's scope.
// `context` is captured in setup because every later hook needs it.
let context: PluginContext | null = null;
let runtime: RuntimeState | null = null;

/**
 * Shutdown signal for the poll loop.
 *
 * Created at module scope — deliberately not inside a lifecycle hook. See
 * `pollForever` for why the loop must live outside every host invocation.
 */
const shutdown = new AbortController();
/** Resolves once the poll loop has exited, so shutdown can await it. */
let pollLoopExited: Promise<void> = Promise.resolve();

function requireContext(): PluginContext {
  if (!context) throw new Error("Plugin context is not available yet");
  return context;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(finish, ms);
    function finish() {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    }
    signal.addEventListener("abort", finish, { once: true });
  });
}

/** Handle one update without letting a single bad message kill the loop. */
async function dispatch(ctx: PluginContext, state: RuntimeState, update: TelegramUpdate): Promise<void> {
  try {
    await state.bridge.handleUpdate(update);
  } catch (error) {
    ctx.logger.error("Failed to handle Telegram update", {
      updateId: update.update_id,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * The polling loop.
 *
 * Started from `setup()` and nowhere else, and that placement is load-bearing.
 *
 * The worker tags every host call with the invocation it is currently inside,
 * read from an AsyncLocalStorage store — and an async loop inherits that store
 * from whatever started it. Started from `onConfigChanged`, which the host runs
 * inside a company-scoped invocation, every later poll would quote that
 * long-finished invocation id and the host would refuse the call with "the
 * worker referenced a missing, expired, or unknown invocation scope".
 *
 * `initialize` carries no companyId, so the host mints no invocation for it, so
 * a loop started from `setup()` sends no invocation id at all. That is exactly
 * the case the host treats as a proactive worker call and admits against the
 * plugin's configured companies.
 */
async function pollForever(ctx: PluginContext): Promise<void> {
  let backoffMs = MIN_BACKOFF_MS;
  let offset = await getUpdateOffset(ctx);

  while (!shutdown.signal.aborted) {
    const state = runtime;
    // Idle until a company configuration arrives, and stay idle when the
    // operator chose webhook delivery instead.
    if (!state || state.config.transport !== "polling") {
      await sleep(1_000, shutdown.signal);
      continue;
    }

    try {
      const token = await resolveBotToken(ctx, state.config, state.companyId);
      const api = createTelegramClient({ token, fetch: (url, init) => ctx.http.fetch(url, init) });

      const updates = await api.getUpdates({
        offset,
        timeoutSeconds: LONG_POLL_TIMEOUT_SECONDS,
        signal: shutdown.signal,
      });
      backoffMs = MIN_BACKOFF_MS;

      for (const update of updates) {
        if (shutdown.signal.aborted) break;
        // Advance and persist the offset *before* handling. A handler that
        // throws must not make the same update replay forever — that would
        // wedge the loop on one bad message and block every later one.
        offset = update.update_id + 1;
        await setUpdateOffset(ctx, offset);
        await dispatch(ctx, state, update);
      }
    } catch (error) {
      if (shutdown.signal.aborted) break;

      // Telegram asks for a specific cool-down when it rate limits us.
      const retryAfter = error instanceof TelegramApiError ? error.retryAfterSeconds : null;
      const waitMs = retryAfter ? retryAfter * 1_000 : backoffMs;
      ctx.logger.warn("Telegram poll failed; backing off", {
        reason: error instanceof Error ? error.message : String(error),
        waitMs,
      });
      await sleep(waitMs, shutdown.signal);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    }
  }
}

/**
 * Apply a company configuration.
 *
 * This only swaps the runtime state; it never starts the poll loop. The loop
 * reads `runtime` at the top of every cycle, so a config change takes effect on
 * the next pass without restarting anything — and, critically, without the loop
 * ever being created inside this invocation's scope.
 */
function applyConfig(ctx: PluginContext, companyId: string, rawConfig: Record<string, unknown>): void {
  const validation = validateConfig(rawConfig);
  if (!validation.ok) {
    runtime = null;
    ctx.logger.warn("Telegram bridge is not configured; staying idle", { errors: validation.errors });
    return;
  }

  const config = parseConfig(rawConfig);
  runtime = { companyId, config, bridge: createBridge({ ctx, config, companyId }) };

  ctx.logger.info("Telegram bridge configured", {
    companyId,
    transport: config.transport,
    allowedSenders: config.allowedTelegramUserIds.length,
  });
}

/**
 * Telegram ↔ Paperclip chat bridge worker.
 *
 * Single-tenant by design (`multiCompanyConfig` is not set): one bot token maps
 * to one company. The host then fails closed if a second company's config is
 * ever delivered, which is the behavior we want — a worker silently switching
 * companies would relay one company's work into another's chat.
 */
const plugin = definePlugin({
  async setup(ctx) {
    context = ctx;

    // Outbound relay. Both handlers are no-ops until config arrives, and both
    // ignore events from companies this worker is not bound to.
    ctx.events.on("issue.comment.created", async (event) => {
      if (!runtime || event.companyId !== runtime.companyId) return;
      await runtime.bridge.handleCommentCreated(event);
    });

    ctx.events.on("issue.updated", async (event) => {
      if (!runtime || event.companyId !== runtime.companyId) return;
      await runtime.bridge.handleIssueUpdated(event);
    });

    // Run lifecycle drives the live typing indicator.
    ctx.events.on("agent.run.started", async (event) => {
      if (!runtime || event.companyId !== runtime.companyId) return;
      await runtime.bridge.handleRunStarted(event);
    });

    for (const ended of ["agent.run.finished", "agent.run.failed", "agent.run.cancelled"] as const) {
      ctx.events.on(ended, async (event) => {
        if (!runtime || event.companyId !== runtime.companyId) return;
        await runtime.bridge.handleRunEnded(event);
      });
    }

    ctx.events.on("approval.created", async (event) => {
      if (!runtime || event.companyId !== runtime.companyId) return;
      if (!runtime.config.relayApprovals) return;
      await runtime.bridge.handleApprovalCreated(event);
    });

    ctx.events.on("agent.run.failed", async (event) => {
      if (!runtime || event.companyId !== runtime.companyId) return;
      if (!runtime.config.relayAlerts) return;
      await runtime.bridge.handleRunFailed(event);
    });

    ctx.events.on("budget.incident.opened", async (event) => {
      if (!runtime || event.companyId !== runtime.companyId) return;
      if (!runtime.config.relayAlerts) return;
      await runtime.bridge.handleBudgetIncident(event);
    });

    // Start the poll loop here, outside every host invocation, so its calls
    // reach the host as proactive worker calls. See pollForever.
    pollLoopExited = pollForever(ctx).catch((error) => {
      ctx.logger.error("Telegram poll loop exited unexpectedly", {
        reason: error instanceof Error ? error.message : String(error),
      });
    });

    ctx.logger.info("Telegram bridge worker ready; waiting for company configuration");
  },

  async onValidateConfig(config) {
    const result = validateConfig(config);
    return { ok: result.ok, errors: result.errors, warnings: result.warnings };
  },

  /**
   * The host replays every configured company's config right after startup and
   * on each save. This is the only point where a proactive plugin learns its
   * company scope — `setup` has none.
   */
  async onConfigChanged(newConfig, changeContext) {
    const ctx = requireContext();
    const companyId = changeContext?.companyId;
    if (!companyId) {
      ctx.logger.warn("Ignoring instance-scoped config delivery; this bridge needs a company scope");
      return;
    }
    applyConfig(ctx, companyId, newConfig);
  },

  async onWebhook(input) {
    const ctx = requireContext();
    if (input.endpointKey !== WEBHOOK_ENDPOINT_KEY) return;

    const state = runtime;
    if (!state) {
      ctx.logger.warn("Received a Telegram webhook while the bridge is idle");
      return;
    }
    if (state.config.transport !== "webhook") {
      ctx.logger.warn("Received a Telegram webhook while transport is 'polling'; ignoring");
      return;
    }

    // The webhook route is public by design — this check is the only thing
    // between the internet and the agent's inbox.
    const expected = await resolveWebhookSecret(ctx, state.config, state.companyId);
    const header = input.headers["x-telegram-bot-api-secret-token"];
    const presented = Array.isArray(header) ? header[0] : header;
    if (!expected || presented !== expected) {
      ctx.logger.warn("Rejected a Telegram webhook with a missing or wrong secret token");
      return;
    }

    const update = input.parsedBody as TelegramUpdate | undefined;
    if (!update || typeof update.update_id !== "number") {
      ctx.logger.warn("Rejected a Telegram webhook with an unparseable body");
      return;
    }

    // Telegram redelivers a webhook it did not get a 200 for, so handling has
    // to be idempotent or a retry posts the same message twice.
    if (await wasUpdateSeen(ctx, update.update_id)) {
      ctx.logger.info("Skipped a redelivered Telegram update", { updateId: update.update_id });
      return;
    }
    await markUpdateSeen(ctx, update.update_id);

    await dispatch(ctx, state, update);
  },

  async onHealth() {
    if (!runtime) {
      return {
        status: "degraded",
        message: "Not configured — set the bot token, operator user ID, and allowlist.",
      };
    }
    return {
      status: "ok",
      message: `Bridging ${runtime.config.transport} for company ${runtime.companyId}`,
    };
  },

  async onShutdown() {
    shutdown.abort();
    runtime = null;
    await pollLoopExited;
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
