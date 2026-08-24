import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { PluginContext, ToolResult } from "@paperclipai/plugin-sdk";
import { parseConfig, validateConfig, type EmailConfig } from "./config.js";
import manifest, {
  ACTION_SEND_TEST,
  DATA_OVERVIEW,
  TOOL_SEND_EMAIL,
} from "./manifest.js";
import { sendEmail } from "./send.js";
import { computeBudget, readSendLog } from "./state.js";

// One worker process serves one plugin, so module scope is the plugin's scope.
let context: PluginContext | null = null;

/**
 * Per-company configuration.
 *
 * This plugin is `multiCompanyConfig`: one Paperclip instance may host several
 * companies, each with its own mail server, sender, and allowlist. Keying on
 * companyId is what keeps company A's allowlist from ever authorizing a send
 * with company B's credentials.
 */
const configs = new Map<string, EmailConfig>();

function requireContext(): PluginContext {
  if (!context) throw new Error("Plugin context is not available yet");
  return context;
}

/** The manifest is the single source of truth for the tool's shape. */
const sendEmailDeclaration = manifest.tools?.find((tool) => tool.name === TOOL_SEND_EMAIL);

function configFor(companyId: string | null | undefined): EmailConfig | null {
  if (!companyId) return null;
  return configs.get(companyId) ?? null;
}

/**
 * Config summary for the settings page.
 *
 * Explicitly reconstructed field by field rather than spread, so a secret added
 * to `EmailConfig` later cannot ride along into a UI payload by default.
 */
function describeConfig(config: EmailConfig) {
  return {
    host: config.host,
    port: config.port,
    secure: config.secure,
    username: config.username,
    hasPassword: config.password != null,
    passwordIsSecretRef: typeof config.password === "object" && config.password !== null,
    rejectUnauthorized: config.rejectUnauthorized,
    fromAddress: config.fromAddress,
    fromName: config.fromName,
    replyToAddress: config.replyToAddress,
    allowedRecipients: config.allowedRecipients,
    subjectPrefix: config.subjectPrefix,
    htmlTemplate: config.htmlTemplate,
    maxPerHour: config.maxPerHour,
    maxPerDay: config.maxPerDay,
  };
}

const plugin = definePlugin({
  // See `configs`: this worker serves every configured company, keyed by id.
  multiCompanyConfig: true,

  async setup(ctx) {
    context = ctx;

    ctx.tools.register(
      TOOL_SEND_EMAIL,
      {
        displayName: sendEmailDeclaration?.displayName ?? "Send email",
        description: sendEmailDeclaration?.description ?? "Send an email over SMTP.",
        parametersSchema: sendEmailDeclaration?.parametersSchema ?? { type: "object" },
      },
      async (params, runCtx): Promise<ToolResult> => {
        const config = configFor(runCtx.companyId);
        if (!config) {
          return {
            error:
              "Email is not configured for this company. An operator must fill in Company settings → Email first.",
          };
        }

        const outcome = await sendEmail({
          ctx,
          companyId: runCtx.companyId,
          config,
          request: (params ?? {}) as Record<string, unknown>,
          source: "agent",
          agentId: runCtx.agentId,
          runId: runCtx.runId,
        });

        if (!outcome.ok) {
          // Returned as a tool error rather than thrown: the agent should read
          // the reason and correct itself (fix an address, wait out the limit)
          // instead of seeing an opaque tool crash.
          return { error: outcome.error ?? "email send failed" };
        }

        return {
          content: `Email sent to ${(outcome.recipients ?? []).join(", ")}.`,
          data: { messageId: outcome.messageId, recipients: outcome.recipients },
        };
      },
    );

    // --- settings page wiring ---------------------------------------------
    ctx.data.register(DATA_OVERVIEW, async (params) => {
      const companyId = typeof params?.companyId === "string" ? params.companyId : null;
      const config = configFor(companyId);
      if (!companyId) return { configured: false, reason: "no company scope" };
      if (!config) return { configured: false, reason: "not configured" };

      const entries = await readSendLog(ctx, companyId);
      const now = Date.now();
      return {
        configured: true,
        config: describeConfig(config),
        budget: computeBudget(entries, config, now),
        recent: entries.slice(0, 20),
      };
    });

    ctx.actions.register(ACTION_SEND_TEST, async (params, actionCtx) => {
      const companyId = actionCtx.companyId;
      const config = configFor(companyId);
      if (!companyId || !config) {
        return { ok: false, error: "Email is not configured for this company yet." };
      }

      const to = typeof params?.to === "string" ? params.to : "";
      if (to.trim().length === 0) {
        return { ok: false, error: "Pick a recipient to send the test to." };
      }

      // The test send goes through the same pipeline as an agent send — same
      // allowlist, same rate limit, same logging. A test that took a shortcut
      // would prove the shortcut works, not the thing operators rely on.
      const outcome = await sendEmail({
        ctx,
        companyId,
        config,
        source: "test",
        request: {
          to: [to],
          subject: "Paperclip test message",
          body: [
            "This is a test message from the Paperclip email plugin.",
            "",
            `- Server: \`${config.host}:${config.port}\``,
            `- From: ${config.fromAddress}`,
            `- Reply-to: ${config.replyToAddress}`,
            "",
            "If this arrived, agents on this company can send email.",
          ].join("\n"),
        },
      });

      return outcome.ok
        ? { ok: true, messageId: outcome.messageId }
        : { ok: false, error: outcome.error };
    });

    ctx.logger.info("Email plugin worker ready; waiting for company configuration");
  },

  async onValidateConfig(config) {
    const result = validateConfig(config);
    return { ok: result.ok, errors: result.errors, warnings: result.warnings };
  },

  /**
   * The host replays every configured company's config right after startup and
   * on each save, so this is where the worker learns its company scope.
   *
   * An invalid config drops the company from the map rather than keeping the
   * previous one. Half-saved settings must disable sending, not silently keep
   * mailing with the values the operator was in the middle of replacing.
   */
  async onConfigChanged(newConfig, changeContext) {
    const ctx = requireContext();
    const companyId = changeContext?.companyId;
    if (!companyId) {
      ctx.logger.warn("Ignoring instance-scoped config delivery; email config is company-scoped");
      return;
    }

    const validation = validateConfig(newConfig);
    if (!validation.ok) {
      configs.delete(companyId);
      ctx.logger.warn("Email is not configured for this company; sending is disabled", {
        companyId,
        errors: validation.errors,
      });
      return;
    }

    const config = parseConfig(newConfig);
    configs.set(companyId, config);
    ctx.logger.info("Email configured", {
      companyId,
      host: config.host,
      port: config.port,
      allowedRecipients: config.allowedRecipients.length,
    });
  },

  async onHealth() {
    if (configs.size === 0) {
      return {
        status: "degraded",
        message: "No company has a valid email configuration yet.",
      };
    }
    return {
      status: "ok",
      message: `Email configured for ${configs.size} compan${configs.size === 1 ? "y" : "ies"}`,
    };
  },

  async onShutdown() {
    configs.clear();
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
