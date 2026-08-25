// src/ui/index.tsx
import { useMemo, useState } from "react";
import {
  StatusBadge,
  usePluginAction,
  usePluginData,
  usePluginToast
} from "@paperclipai/plugin-sdk/ui";

// src/manifest.ts
var DATA_OVERVIEW = "overview";
var ACTION_SEND_TEST = "sendTest";

// src/ui/index.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var stack = { display: "grid", gap: "16px" };
var card = {
  border: "1px solid var(--border, #e4e4e7)",
  padding: "16px",
  display: "grid",
  gap: "12px"
};
var label = {
  fontSize: "11px",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--muted-foreground, #71717a)"
};
var mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" };
var muted = { color: "var(--muted-foreground, #71717a)", fontSize: "13px" };
function Row({ name, children }) {
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "12px", alignItems: "baseline", justifyContent: "space-between" }, children: [
    /* @__PURE__ */ jsx("span", { style: label, children: name }),
    /* @__PURE__ */ jsx("span", { style: { ...mono, fontSize: "13px", textAlign: "right" }, children })
  ] });
}
function BudgetBar({ used, limit, window }) {
  const percent = limit > 0 ? Math.min(100, used / limit * 100) : 0;
  return /* @__PURE__ */ jsxs("div", { style: { display: "grid", gap: "4px" }, children: [
    /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "12px" }, children: [
      /* @__PURE__ */ jsx("span", { style: muted, children: window }),
      /* @__PURE__ */ jsxs("span", { style: mono, children: [
        used,
        " / ",
        limit
      ] })
    ] }),
    /* @__PURE__ */ jsx("div", { style: { height: "6px", border: "1px solid var(--border, #e4e4e7)", overflow: "hidden" }, children: /* @__PURE__ */ jsx(
      "div",
      {
        style: {
          height: "100%",
          width: `${percent}%`,
          background: percent >= 100 ? "#dc2626" : percent >= 70 ? "#d97706" : "#16a34a"
        }
      }
    ) })
  ] });
}
function EmailCompanySettingsPage({ context }) {
  const companyId = context.companyId ?? void 0;
  const { data, loading, error, refresh } = usePluginData(DATA_OVERVIEW, { companyId });
  const sendTest = usePluginAction(ACTION_SEND_TEST);
  const toast = usePluginToast();
  const [recipient, setRecipient] = useState("");
  const [sending, setSending] = useState(false);
  const allowlist = useMemo(() => data?.config?.allowedRecipients ?? [], [data]);
  const exactAddresses = useMemo(
    () => allowlist.filter((entry) => !entry.startsWith("@")),
    [allowlist]
  );
  async function handleTest() {
    const target = recipient.trim() || exactAddresses[0] || "";
    if (target.length === 0) {
      toast({ title: "Pick a recipient first", tone: "warn" });
      return;
    }
    setSending(true);
    try {
      const result = await sendTest({ companyId, to: target });
      if (result?.ok) {
        toast({ title: "Test email sent", body: `Delivered to ${target}.`, tone: "success" });
      } else {
        toast({ title: "Test email failed", body: result?.error ?? "Unknown error", tone: "error" });
      }
    } catch (err) {
      toast({ title: "Test email failed", body: err.message, tone: "error" });
    } finally {
      setSending(false);
      refresh();
    }
  }
  if (loading) return /* @__PURE__ */ jsx("div", { style: muted, children: "Loading email settings\u2026" });
  if (error) return /* @__PURE__ */ jsx("div", { style: { color: "#dc2626" }, children: error.message });
  if (!data?.configured || !data.config) {
    return /* @__PURE__ */ jsxs("div", { style: card, children: [
      /* @__PURE__ */ jsx("strong", { children: "Email is not configured" }),
      /* @__PURE__ */ jsxs("p", { style: muted, children: [
        "Fill in the SMTP host, sender, reply-to, and at least one allowed recipient under this plugin's configuration. Until then the ",
        /* @__PURE__ */ jsx("code", { style: mono, children: "send_email" }),
        " tool refuses every call."
      ] }),
      data?.reason ? /* @__PURE__ */ jsxs("p", { style: muted, children: [
        "Reason: ",
        data.reason
      ] }) : null
    ] });
  }
  const config = data.config;
  const budget = data.budget;
  const recent = data.recent ?? [];
  return /* @__PURE__ */ jsxs("div", { style: stack, children: [
    /* @__PURE__ */ jsxs("div", { style: card, children: [
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
        /* @__PURE__ */ jsx("strong", { children: "SMTP" }),
        /* @__PURE__ */ jsx(
          StatusBadge,
          {
            label: config.passwordIsSecretRef ? "Secret bound" : config.hasPassword ? "Inline password" : "No password",
            status: config.passwordIsSecretRef ? "ok" : config.hasPassword ? "warning" : "info"
          }
        )
      ] }),
      /* @__PURE__ */ jsxs(Row, { name: "Server", children: [
        config.host,
        ":",
        config.port,
        " ",
        config.secure ? "(implicit TLS)" : "(STARTTLS)"
      ] }),
      /* @__PURE__ */ jsx(Row, { name: "Username", children: config.username ?? "\u2014" }),
      /* @__PURE__ */ jsx(Row, { name: "TLS verification", children: config.rejectUnauthorized ? "on" : "off" }),
      /* @__PURE__ */ jsxs(Row, { name: "From", children: [
        config.fromName,
        " <",
        config.fromAddress,
        ">"
      ] }),
      /* @__PURE__ */ jsx(Row, { name: "Reply-to", children: config.replyToAddress }),
      config.bccAddress ? /* @__PURE__ */ jsx(Row, { name: "BCC", children: config.bccAddress }) : null,
      config.subjectPrefix ? /* @__PURE__ */ jsx(Row, { name: "Subject prefix", children: config.subjectPrefix }) : null,
      /* @__PURE__ */ jsx(Row, { name: "Template", children: config.htmlTemplate ? "Custom HTML template" : "Default clean theme" })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: card, children: [
      /* @__PURE__ */ jsx("strong", { children: "Allowed recipients" }),
      /* @__PURE__ */ jsx("p", { style: muted, children: "Agents may only mail these. Everything else fails with an error naming the address." }),
      /* @__PURE__ */ jsx("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px" }, children: allowlist.map((entry) => /* @__PURE__ */ jsx(
        "span",
        {
          style: {
            ...mono,
            fontSize: "12px",
            border: "1px solid var(--border, #e4e4e7)",
            padding: "2px 8px"
          },
          children: entry
        },
        entry
      )) })
    ] }),
    budget ? /* @__PURE__ */ jsxs("div", { style: card, children: [
      /* @__PURE__ */ jsx("strong", { children: "Rate limit" }),
      /* @__PURE__ */ jsx(BudgetBar, { used: budget.hourUsed, limit: budget.hourLimit, window: "This hour" }),
      /* @__PURE__ */ jsx(BudgetBar, { used: budget.dayUsed, limit: budget.dayLimit, window: "Last 24 hours" }),
      /* @__PURE__ */ jsx("p", { style: muted, children: "Failed attempts count too \u2014 the limit exists to stop a retry loop, not just a chatty one." })
    ] }) : null,
    /* @__PURE__ */ jsxs("div", { style: card, children: [
      /* @__PURE__ */ jsx("strong", { children: "Send a test" }),
      /* @__PURE__ */ jsx("p", { style: muted, children: "Goes through the same allowlist, rate limit, and logging as an agent send." }),
      /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" }, children: [
        exactAddresses.length > 0 ? /* @__PURE__ */ jsxs(
          "select",
          {
            value: recipient,
            onChange: (event) => setRecipient(event.target.value),
            style: { ...mono, fontSize: "13px", padding: "6px 8px", flex: "1 1 220px" },
            children: [
              /* @__PURE__ */ jsx("option", { value: "", children: "Choose a recipient\u2026" }),
              exactAddresses.map((entry) => /* @__PURE__ */ jsx("option", { value: entry, children: entry }, entry))
            ]
          }
        ) : /* @__PURE__ */ jsx(
          "input",
          {
            type: "email",
            value: recipient,
            placeholder: "you@example.com",
            onChange: (event) => setRecipient(event.target.value),
            style: { ...mono, fontSize: "13px", padding: "6px 8px", flex: "1 1 220px" }
          }
        ),
        /* @__PURE__ */ jsx("button", { type: "button", onClick: handleTest, disabled: sending, style: { padding: "6px 14px" }, children: sending ? "Sending\u2026" : "Send test email" })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { style: card, children: [
      /* @__PURE__ */ jsx("strong", { children: "Recent sends" }),
      recent.length === 0 ? /* @__PURE__ */ jsx("p", { style: muted, children: "Nothing sent yet." }) : /* @__PURE__ */ jsx("div", { style: { display: "grid", gap: "10px" }, children: recent.map((entry) => /* @__PURE__ */ jsxs(
        "div",
        {
          style: {
            display: "grid",
            gap: "2px",
            paddingBottom: "8px",
            borderBottom: "1px solid var(--border, #e4e4e7)"
          },
          children: [
            /* @__PURE__ */ jsxs("div", { style: { display: "flex", justifyContent: "space-between", gap: "8px" }, children: [
              /* @__PURE__ */ jsx("span", { style: { fontSize: "13px" }, children: entry.subject }),
              /* @__PURE__ */ jsx(StatusBadge, { label: entry.ok ? "sent" : "failed", status: entry.ok ? "ok" : "error" })
            ] }),
            /* @__PURE__ */ jsxs("div", { style: { ...muted, ...mono, fontSize: "12px" }, children: [
              new Date(entry.at).toLocaleString(),
              " \xB7 ",
              entry.to.join(", "),
              " \xB7 ",
              entry.source
            ] }),
            entry.error ? /* @__PURE__ */ jsx("div", { style: { color: "#dc2626", fontSize: "12px" }, children: entry.error }) : null
          ]
        },
        `${entry.at}-${entry.subject}`
      )) })
    ] })
  ] });
}
export {
  EmailCompanySettingsPage
};
//# sourceMappingURL=index.js.map
