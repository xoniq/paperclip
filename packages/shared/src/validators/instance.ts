import { z } from "zod";
import { DEFAULT_FEEDBACK_DATA_SHARING_PREFERENCE } from "../types/feedback.js";
import {
  DAILY_RETENTION_PRESETS,
  WEEKLY_RETENTION_PRESETS,
  MONTHLY_RETENTION_PRESETS,
  DEFAULT_BACKUP_RETENTION,
  DEFAULT_INSTANCE_BRANDING,
  DEFAULT_INSTANCE_THEMING,
  DEFAULT_INSTANCE_NAVIGATION,
  DEFAULT_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS,
  MAX_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS,
  MIN_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS,
} from "../types/instance.js";
import { feedbackDataSharingPreferenceSchema } from "./feedback.js";

function presetSchema<T extends readonly number[]>(presets: T, label: string) {
  return z.number().refine(
    (v): v is T[number] => (presets as readonly number[]).includes(v),
    { message: `${label} must be one of: ${presets.join(", ")}` },
  );
}

export const backupRetentionPolicySchema = z.object({
  dailyDays: presetSchema(DAILY_RETENTION_PRESETS, "dailyDays").default(DEFAULT_BACKUP_RETENTION.dailyDays),
  weeklyWeeks: presetSchema(WEEKLY_RETENTION_PRESETS, "weeklyWeeks").default(DEFAULT_BACKUP_RETENTION.weeklyWeeks),
  monthlyMonths: presetSchema(MONTHLY_RETENTION_PRESETS, "monthlyMonths").default(DEFAULT_BACKUP_RETENTION.monthlyMonths),
});

export const instanceBrandingSettingsSchema = z.object({
  platformName: z.string().trim().min(1).max(100).default(DEFAULT_INSTANCE_BRANDING.platformName),
  logoUrl: z.string().trim().nullable().default(DEFAULT_INSTANCE_BRANDING.logoUrl),
  faviconUrl: z.string().trim().nullable().default(DEFAULT_INSTANCE_BRANDING.faviconUrl),
  tagline: z.string().trim().max(255).nullable().default(DEFAULT_INSTANCE_BRANDING.tagline),
});

export const patchInstanceBrandingSettingsSchema = instanceBrandingSettingsSchema.partial();

export const themeOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  filename: z.string().min(1),
  description: z.string().optional(),
  author: z.string().optional(),
  isCustom: z.boolean().optional(),
});

export const instanceThemingSettingsSchema = z.object({
  activeTheme: z.string().trim().nullable().default(DEFAULT_INSTANCE_THEMING.activeTheme),
  customCss: z.string().nullable().default(DEFAULT_INSTANCE_THEMING.customCss),
});

export const patchInstanceThemingSettingsSchema = instanceThemingSettingsSchema.partial();

export const instanceNavigationSettingsSchema = z.object({
  hiddenSidebarItems: z.array(z.string().trim()).default(DEFAULT_INSTANCE_NAVIGATION.hiddenSidebarItems),
});

export const patchInstanceNavigationSettingsSchema = instanceNavigationSettingsSchema.partial();

export const instanceGeneralSettingsSchema = z.object({
  censorUsernameInLogs: z.boolean().default(false),
  keyboardShortcuts: z.boolean().default(false),
  feedbackDataSharingPreference: feedbackDataSharingPreferenceSchema.default(
    DEFAULT_FEEDBACK_DATA_SHARING_PREFERENCE,
  ),
  backupRetention: backupRetentionPolicySchema.default(DEFAULT_BACKUP_RETENTION),
  // Execution policy. Absent/"any" = unrestricted; "kubernetes" forces the
  // Kubernetes sandbox provider and denies local/ssh execution (cloud_tenant).
  executionMode: z.enum(["kubernetes", "any"]).optional(),
  branding: instanceBrandingSettingsSchema.default(DEFAULT_INSTANCE_BRANDING),
  theming: instanceThemingSettingsSchema.default(DEFAULT_INSTANCE_THEMING),
  navigation: instanceNavigationSettingsSchema.default(DEFAULT_INSTANCE_NAVIGATION),
}).strict();

export const patchInstanceGeneralSettingsSchema = instanceGeneralSettingsSchema.partial();

export const instanceExperimentalSettingsSchema = z.object({
  enableEnvironments: z.boolean().default(false),
  enableManagedSandboxOnly: z.boolean().default(false),
  enableIsolatedWorkspaces: z.boolean().default(false),
  enableStreamlinedLeftNavigation: z.boolean().default(true),
  enableApps: z.boolean().default(false),
  enablePipelines: z.boolean().default(false),
  enableCases: z.boolean().default(false),
  enableConferenceRoomChat: z.boolean().default(false),
  enableClassicTaskInterface: z.boolean().default(false),
  enableTaskWatchdogs: z.boolean().default(false),
  enableIssuePlanDecompositions: z.boolean().default(false),
  enableExperimentalFileViewer: z.boolean().default(false),
  enableExternalObjects: z.boolean().default(false),
  enableSmokeLab: z.boolean().default(false),
  enableBuiltInAgents: z.boolean().default(false),
  enableBetaSkills: z.boolean().default(false),
  enableSummaries: z.boolean().default(false),
  enableStatusCards: z.boolean().default(false),
  enableDecisions: z.boolean().default(false),
  enableGoalsSidebarLink: z.boolean().default(false),
  enableServerInfoDebugView: z.boolean().default(false),
  enableSimplifiedEnglishInteractions: z.boolean().default(false),
  autoRestartDevServerWhenIdle: z.boolean().default(false),
  enableIssueGraphLivenessAutoRecovery: z.boolean().default(false),
  enableWorkspaceBranchReconcileForward: z.boolean().default(true),
  enableWorkspaceDirtyQuarantineRepair: z.boolean().default(true),
  enableOwnerInstanceAdmin: z.boolean().default(false),
  // Kill switch for the sandbox duplex command-stream bridge. Default off. When
  // off the host keeps the file bridge for every run with no manifest change and
  // no redeploy. The host reads this per run before it selects the transport.
  enableSandboxDuplexBridge: z.boolean().default(false),
  enableWorktreeRunExecution: z.boolean().default(false),
  worktreeRunExecutionActivatedAt: z.string().datetime().nullable().default(null),
  worktreeRunExecutionActivationInstanceId: z.string().min(1).nullable().default(null),
  issueGraphLivenessAutoRecoveryLookbackHours: z
    .number()
    .int()
    .min(MIN_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS)
    .max(MAX_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS)
    .default(DEFAULT_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS),
}).strict();

export const patchInstanceExperimentalSettingsSchema = instanceExperimentalSettingsSchema
  .omit({
    worktreeRunExecutionActivatedAt: true,
    worktreeRunExecutionActivationInstanceId: true,
  })
  .partial()
  .strip();

export const managedSettingMetadataSchema = z.object({
  managed: z.literal(true),
  managedBy: z.literal("paperclip-cloud"),
}).strict();

// Response shape of the experimental settings endpoints: on cloud-managed
// instances every overlaid key is listed in `managedKeys`; self-hosted
// responses omit the field entirely.
export const instanceExperimentalSettingsWithManagedSchema = instanceExperimentalSettingsSchema.extend({
  managedKeys: z.record(managedSettingMetadataSchema).optional(),
}).strict();

export const patchInstanceSettingsSchema = z.object({
  defaultEnvironmentId: z.string().uuid().nullable().optional(),
}).strict();

export const issueGraphLivenessAutoRecoveryRequestSchema = z.object({
  lookbackHours: z
    .number()
    .int()
    .min(MIN_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS)
    .max(MAX_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS)
    .optional(),
}).strict();

export type InstanceBrandingSettings = z.infer<typeof instanceBrandingSettingsSchema>;
export type PatchInstanceBrandingSettings = z.infer<typeof patchInstanceBrandingSettingsSchema>;
export type ThemeOption = z.infer<typeof themeOptionSchema>;
export type InstanceThemingSettings = z.infer<typeof instanceThemingSettingsSchema>;
export type PatchInstanceThemingSettings = z.infer<typeof patchInstanceThemingSettingsSchema>;
export type InstanceNavigationSettings = z.infer<typeof instanceNavigationSettingsSchema>;
export type PatchInstanceNavigationSettings = z.infer<typeof patchInstanceNavigationSettingsSchema>;
export type InstanceGeneralSettings = z.infer<typeof instanceGeneralSettingsSchema>;
export type PatchInstanceGeneralSettings = z.infer<typeof patchInstanceGeneralSettingsSchema>;
export type InstanceExperimentalSettings = z.infer<typeof instanceExperimentalSettingsSchema>;
export type PatchInstanceExperimentalSettings = z.infer<typeof patchInstanceExperimentalSettingsSchema>;
export type PatchInstanceSettings = z.infer<typeof patchInstanceSettingsSchema>;
export type IssueGraphLivenessAutoRecoveryRequest = z.infer<
  typeof issueGraphLivenessAutoRecoveryRequestSchema
>;

export const instanceSettingsSchema = z.object({
  id: z.string().uuid(),
  defaultEnvironmentId: z.string().uuid().nullable(),
  general: instanceGeneralSettingsSchema,
  experimental: instanceExperimentalSettingsWithManagedSchema,
  createdAt: z.union([z.date(), z.string().datetime()]),
  updatedAt: z.union([z.date(), z.string().datetime()]),
}).strict();
