import { useMemo, useState } from "react";
import {
  StatusBadge,
  usePluginAction,
  usePluginData,
  usePluginToast,
  type PluginCompanySettingsPageProps,
} from "@paperclipai/plugin-sdk/ui";
import { ACTION_SEND_TEST, DATA_OVERVIEW } from "../manifest.js";

interface ConfigSummary {
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  hasPassword: boolean;
  passwordIsSecretRef: boolean;
  rejectUnauthorized: boolean;
  fromAddress: string;
  fromName: string;
  replyToAddress: string;
  allowedRecipients: string[];
  subjectPrefix: string | null;
  maxPerHour: number;
  maxPerDay: number;
}

interface SendEntry {
  at: number;
  to: string[];
  subject: string;
  ok: boolean;
  messageId?: string;
  error?: string;
  source: "agent" | "test";
}

interface Overview {
  configured: boolean;
  reason?: string;
  config?: ConfigSummary;
  budget?: { hourUsed: number; hourLimit: number; dayUsed: number; dayLimit: number };
  recent?: SendEntry[];
}

const stack: React.CSSProperties = { display: "grid", gap: "16px" };
const card: React.CSSProperties = {
  border: "1px solid var(--border, #e4e4e7)",
  padding: "16px",
  display: "grid",
  gap: "12px",
};
const label: React.CSSProperties = {
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--muted-foreground, #71717a)",
};
const mono: React.CSSProperties = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };
const muted: React.CSSProperties = { color: "var(--muted-foreground, #71717a)", fontSize: "13px" };

function Row({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: "12px", alignItems: "baseline", justifyContent: "space-between" }}>
      <span style={label}>{name}</span>
      <span style={{ ...mono, fontSize: "13px", textAlign: "right" }}>{children}</span>
    </div>
  );
}

/** Horizontal usage bar for one rate-limit window. */
function BudgetBar({ used, limit, window }: { used: number; limit: number; window: string }) {
  const percent = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div style={{ display: "grid", gap: "4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
        <span style={muted}>{window}</span>
        <span style={mono}>
          {used} / {limit}
        </span>
      </div>
      <div style={{ height: "6px", border: "1px solid var(--border, #e4e4e7)", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${percent}%`,
            background: percent >= 100 ? "#dc2626" : percent >= 70 ? "#d97706" : "#16a34a",
          }}
        />
      </div>
    </div>
  );
}

export function EmailCompanySettingsPage({ context }: PluginCompanySettingsPageProps) {
  const companyId = context.companyId ?? undefined;
  const { data, loading, error, refresh } = usePluginData<Overview>(DATA_OVERVIEW, { companyId });
  const sendTest = usePluginAction(ACTION_SEND_TEST);
  const toast = usePluginToast();

  const [recipient, setRecipient] = useState("");
  const [sending, setSending] = useState(false);

  const allowlist = useMemo(() => data?.config?.allowedRecipients ?? [], [data]);

  // Domain entries have no single address to send to, so the test picker only
  // offers exact addresses. A domain-only allowlist gets a free-text box.
  const exactAddresses = useMemo(
    () => allowlist.filter((entry) => !entry.startsWith("@")),
    [allowlist],
  );

  async function handleTest() {
    const target = recipient.trim() || exactAddresses[0] || "";
    if (target.length === 0) {
      toast({ title: "Pick a recipient first", tone: "warn" });
      return;
    }
    setSending(true);
    try {
      const result = (await sendTest({ companyId, to: target })) as { ok?: boolean; error?: string };
      if (result?.ok) {
        toast({ title: "Test email sent", body: `Delivered to ${target}.`, tone: "success" });
      } else {
        toast({ title: "Test email failed", body: result?.error ?? "Unknown error", tone: "error" });
      }
    } catch (err) {
      toast({ title: "Test email failed", body: (err as Error).message, tone: "error" });
    } finally {
      setSending(false);
      // The attempt is on the log and counted against the budget either way.
      refresh();
    }
  }

  if (loading) return <div style={muted}>Loading email settings…</div>;
  if (error) return <div style={{ color: "#dc2626" }}>{error.message}</div>;

  if (!data?.configured || !data.config) {
    return (
      <div style={card}>
        <strong>Email is not configured</strong>
        <p style={muted}>
          Fill in the SMTP host, sender, reply-to, and at least one allowed recipient under this
          plugin's configuration. Until then the <code style={mono}>send_email</code> tool refuses
          every call.
        </p>
        {data?.reason ? <p style={muted}>Reason: {data.reason}</p> : null}
      </div>
    );
  }

  const config = data.config;
  const budget = data.budget;
  const recent = data.recent ?? [];

  return (
    <div style={stack}>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong>SMTP</strong>
          <StatusBadge
            label={config.passwordIsSecretRef ? "Secret bound" : config.hasPassword ? "Inline password" : "No password"}
            status={config.passwordIsSecretRef ? "ok" : config.hasPassword ? "warning" : "info"}
          />
        </div>
        <Row name="Server">
          {config.host}:{config.port} {config.secure ? "(implicit TLS)" : "(STARTTLS)"}
        </Row>
        <Row name="Username">{config.username ?? "—"}</Row>
        <Row name="TLS verification">{config.rejectUnauthorized ? "on" : "off"}</Row>
        <Row name="From">
          {config.fromName} &lt;{config.fromAddress}&gt;
        </Row>
        <Row name="Reply-to">{config.replyToAddress}</Row>
        {config.subjectPrefix ? <Row name="Subject prefix">{config.subjectPrefix}</Row> : null}
      </div>

      <div style={card}>
        <strong>Allowed recipients</strong>
        <p style={muted}>
          Agents may only mail these. Everything else fails with an error naming the address.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {allowlist.map((entry) => (
            <span
              key={entry}
              style={{
                ...mono,
                fontSize: "12px",
                border: "1px solid var(--border, #e4e4e7)",
                padding: "2px 8px",
              }}
            >
              {entry}
            </span>
          ))}
        </div>
      </div>

      {budget ? (
        <div style={card}>
          <strong>Rate limit</strong>
          <BudgetBar used={budget.hourUsed} limit={budget.hourLimit} window="This hour" />
          <BudgetBar used={budget.dayUsed} limit={budget.dayLimit} window="Last 24 hours" />
          <p style={muted}>
            Failed attempts count too — the limit exists to stop a retry loop, not just a chatty one.
          </p>
        </div>
      ) : null}

      <div style={card}>
        <strong>Send a test</strong>
        <p style={muted}>
          Goes through the same allowlist, rate limit, and logging as an agent send.
        </p>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {exactAddresses.length > 0 ? (
            <select
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              style={{ ...mono, fontSize: "13px", padding: "6px 8px", flex: "1 1 220px" }}
            >
              <option value="">Choose a recipient…</option>
              {exactAddresses.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="email"
              value={recipient}
              placeholder="you@example.com"
              onChange={(event) => setRecipient(event.target.value)}
              style={{ ...mono, fontSize: "13px", padding: "6px 8px", flex: "1 1 220px" }}
            />
          )}
          <button type="button" onClick={handleTest} disabled={sending} style={{ padding: "6px 14px" }}>
            {sending ? "Sending…" : "Send test email"}
          </button>
        </div>
      </div>

      <div style={card}>
        <strong>Recent sends</strong>
        {recent.length === 0 ? (
          <p style={muted}>Nothing sent yet.</p>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {recent.map((entry) => (
              <div
                key={`${entry.at}-${entry.subject}`}
                style={{
                  display: "grid",
                  gap: "2px",
                  paddingBottom: "8px",
                  borderBottom: "1px solid var(--border, #e4e4e7)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                  <span style={{ fontSize: "13px" }}>{entry.subject}</span>
                  <StatusBadge label={entry.ok ? "sent" : "failed"} status={entry.ok ? "ok" : "error"} />
                </div>
                <div style={{ ...muted, ...mono, fontSize: "12px" }}>
                  {new Date(entry.at).toLocaleString()} · {entry.to.join(", ")} · {entry.source}
                </div>
                {entry.error ? (
                  <div style={{ color: "#dc2626", fontSize: "12px" }}>{entry.error}</div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
