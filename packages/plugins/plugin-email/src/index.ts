export { default as manifest } from "./manifest.js";
export { default as worker } from "./worker.js";
export {
  ACTION_SEND_TEST,
  DATA_OVERVIEW,
  PLUGIN_ID,
  PLUGIN_VERSION,
  SLOT_COMPANY_SETTINGS,
  TOOL_SEND_EMAIL,
} from "./manifest.js";
export { parseConfig, validateConfig, type EmailConfig } from "./config.js";
export {
  formatFrom,
  isAllowedRecipient,
  normalizeAllowlistEntry,
  parseAddress,
  resolveRecipients,
  sanitizeSubject,
} from "./recipients.js";
export { escapeHtml, markdownToHtml, wrapEmailHtml } from "./markdown.js";
export { computeBudget, readSendLog, type RateBudget, type SendLogEntry } from "./state.js";
export { sendEmail, type SendEmailOutcome, type SendEmailRequest } from "./send.js";
export {
  createNodemailerTransport,
  describeSmtpError,
  transportOptionsFor,
  type SmtpMessage,
  type SmtpTransport,
  type SmtpTransportFactory,
} from "./smtp.js";
