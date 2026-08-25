import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  PatchInstanceGeneralSettings,
  BackupRetentionPolicy,
  InstanceBrandingSettings,
  InstanceThemingSettings,
  InstanceNavigationSettings,
} from "@paperclipai/shared";
import {
  DAILY_RETENTION_PRESETS,
  WEEKLY_RETENTION_PRESETS,
  MONTHLY_RETENTION_PRESETS,
  DEFAULT_BACKUP_RETENTION,
  DEFAULT_INSTANCE_BRANDING,
  DEFAULT_INSTANCE_THEMING,
  DEFAULT_INSTANCE_NAVIGATION,
} from "@paperclipai/shared";
import { Check, LayoutList, LogOut, Palette, SlidersHorizontal, Sparkles } from "lucide-react";
import { healthApi } from "@/api/health";
import { instanceSettingsApi } from "@/api/instanceSettings";
import { ModeBadge } from "@/components/access/ModeBadge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { cn } from "../lib/utils";
import { useSignOut } from "@/hooks/useSignOut";

const FEEDBACK_TERMS_URL = import.meta.env.VITE_FEEDBACK_TERMS_URL?.trim() || "https://paperclip.ing/tos";

export function InstanceGeneralSettings({ embedded = false }: { embedded?: boolean }) {
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);

  const signOutMutation = useSignOut();

  useEffect(() => {
    if (embedded) return;
    setBreadcrumbs([
      { label: "Settings", href: "/company/settings" },
      { label: "General" },
    ]);
  }, [embedded, setBreadcrumbs]);

  const generalQuery = useQuery({
    queryKey: queryKeys.instance.generalSettings,
    queryFn: () => instanceSettingsApi.getGeneral(),
  });
  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
  });

  const updateGeneralMutation = useMutation({
    mutationFn: instanceSettingsApi.updateGeneral,
    onMutate: () => {
      setActionError(null);
      signOutMutation.reset();
    },
    onSuccess: async () => {
      setActionError(null);
      signOutMutation.reset();
      await queryClient.invalidateQueries({ queryKey: queryKeys.instance.generalSettings });
      await queryClient.invalidateQueries({ queryKey: queryKeys.instance.branding });
      await queryClient.invalidateQueries({ queryKey: queryKeys.instance.theming });
      await queryClient.invalidateQueries({ queryKey: queryKeys.instance.navigation });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Failed to update general settings.");
    },
  });

  if (generalQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading general settings...</div>;
  }

  if (generalQuery.error) {
    return (
      <div className="text-sm text-destructive">
        {generalQuery.error instanceof Error
          ? generalQuery.error.message
          : "Failed to load general settings."}
      </div>
    );
  }

  const censorUsernameInLogs = generalQuery.data?.censorUsernameInLogs === true;
  const keyboardShortcuts = generalQuery.data?.keyboardShortcuts === true;
  const feedbackDataSharingPreference = generalQuery.data?.feedbackDataSharingPreference ?? "prompt";
  const backupRetention: BackupRetentionPolicy = generalQuery.data?.backupRetention ?? DEFAULT_BACKUP_RETENTION;
  const visibleActionError = signOutMutation.error instanceof Error
    ? signOutMutation.error.message
    : signOutMutation.error
      ? "Failed to sign out."
      : actionError;

  return (
    <div className={embedded ? "space-y-8" : "max-w-4xl space-y-8"}>
      {!embedded ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">General</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Configure instance-wide preferences including log display, keyboard shortcuts, backup
            retention, and data sharing.
          </p>
        </div>
      ) : null}

      {visibleActionError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {visibleActionError}
        </div>
      )}

      <section>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Deployment and auth</h2>
            <ModeBadge
              deploymentMode={healthQuery.data?.deploymentMode}
              deploymentExposure={healthQuery.data?.deploymentExposure}
            />
          </div>
          <div className="text-sm text-muted-foreground">
            {healthQuery.data?.deploymentMode === "local_trusted"
              ? "Local trusted mode is optimized for a local operator. Browser requests run as local board context and no sign-in is required."
              : healthQuery.data?.deploymentExposure === "public"
                ? "Authenticated public mode requires sign-in for board access and is intended for public URLs."
                : "Authenticated private mode requires sign-in and is intended for LAN, VPN, or other private-network deployments."}
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <StatusBox
              label="Auth readiness"
              value={healthQuery.data?.authReady ? "Ready" : "Not ready"}
            />
            <StatusBox
              label="Bootstrap status"
              value={healthQuery.data?.bootstrapStatus === "bootstrap_pending" ? "Setup required" : "Ready"}
            />
            <StatusBox
              label="Bootstrap invite"
              value={healthQuery.data?.bootstrapInviteActive ? "Active" : "None"}
            />
          </div>
        </div>
      </section>

      <BrandingSection
        branding={generalQuery.data?.branding}
        onSave={(branding) => updateGeneralMutation.mutate({ branding })}
        disabled={updateGeneralMutation.isPending || signOutMutation.isPending}
      />

      <ThemingSection
        theming={generalQuery.data?.theming}
        onSave={(theming) => updateGeneralMutation.mutate({ theming })}
        disabled={updateGeneralMutation.isPending || signOutMutation.isPending}
      />

      <NavigationSection
        navigation={generalQuery.data?.navigation}
        onSave={(navigation) => updateGeneralMutation.mutate({ navigation })}
        disabled={updateGeneralMutation.isPending || signOutMutation.isPending}
      />

      <section>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">Censor username in logs</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Hide the username segment in home-directory paths and similar operator-visible log output. Standalone
              username mentions outside of paths are not yet masked in the live transcript view. This is off by
              default.
            </p>
          </div>
          <ToggleSwitch
            checked={censorUsernameInLogs}
            onCheckedChange={() => updateGeneralMutation.mutate({ censorUsernameInLogs: !censorUsernameInLogs })}
            disabled={updateGeneralMutation.isPending || signOutMutation.isPending}
            aria-label="Toggle username log censoring"
          />
        </div>
      </section>

      <section>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Enable app keyboard shortcuts, including inbox navigation and global shortcuts like creating tasks or
              toggling panels. This is off by default.
            </p>
          </div>
          <ToggleSwitch
            checked={keyboardShortcuts}
            onCheckedChange={() => updateGeneralMutation.mutate({ keyboardShortcuts: !keyboardShortcuts })}
            disabled={updateGeneralMutation.isPending || signOutMutation.isPending}
            aria-label="Toggle keyboard shortcuts"
          />
        </div>
      </section>

      <section>
        <div className="space-y-5">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">Backup retention</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Configure how long automatic database backups are retained. Backups run roughly
              every hour and are compressed with gzip. Within the daily window all backups are
              kept; beyond that, one backup per week and one per month are preserved.
            </p>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Daily</h3>
            <div className="flex flex-wrap gap-2">
              {DAILY_RETENTION_PRESETS.map((days) => {
                const active = backupRetention.dailyDays === days;
                return (
                  <button
                    key={days}
                    type="button"
                    disabled={updateGeneralMutation.isPending || signOutMutation.isPending}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      active
                        ? "border-foreground bg-accent text-foreground"
                        : "border-border bg-background hover:bg-accent/50",
                    )}
                    onClick={() =>
                      updateGeneralMutation.mutate({
                        backupRetention: { ...backupRetention, dailyDays: days },
                      })
                    }
                  >
                    <div className="text-sm font-medium">{days} days</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Weekly</h3>
            <div className="flex flex-wrap gap-2">
              {WEEKLY_RETENTION_PRESETS.map((weeks) => {
                const active = backupRetention.weeklyWeeks === weeks;
                const label = weeks === 1 ? "1 week" : `${weeks} weeks`;
                return (
                  <button
                    key={weeks}
                    type="button"
                    disabled={updateGeneralMutation.isPending || signOutMutation.isPending}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      active
                        ? "border-foreground bg-accent text-foreground"
                        : "border-border bg-background hover:bg-accent/50",
                    )}
                    onClick={() =>
                      updateGeneralMutation.mutate({
                        backupRetention: { ...backupRetention, weeklyWeeks: weeks },
                      })
                    }
                  >
                    <div className="text-sm font-medium">{label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Monthly</h3>
            <div className="flex flex-wrap gap-2">
              {MONTHLY_RETENTION_PRESETS.map((months) => {
                const active = backupRetention.monthlyMonths === months;
                const label = months === 1 ? "1 month" : `${months} months`;
                return (
                  <button
                    key={months}
                    type="button"
                    disabled={updateGeneralMutation.isPending || signOutMutation.isPending}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                      active
                        ? "border-foreground bg-accent text-foreground"
                        : "border-border bg-background hover:bg-accent/50",
                    )}
                    onClick={() =>
                      updateGeneralMutation.mutate({
                        backupRetention: { ...backupRetention, monthlyMonths: months },
                      })
                    }
                  >
                    <div className="text-sm font-medium">{label}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">AI feedback sharing</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Control whether thumbs up and thumbs down votes can send the voted AI output to
              Paperclip Labs. Votes are always saved locally.
            </p>
            {FEEDBACK_TERMS_URL ? (
              <a
                href={FEEDBACK_TERMS_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Read our terms of service
              </a>
            ) : null}
          </div>
          {feedbackDataSharingPreference === "prompt" ? (
            <div className="rounded-lg bg-accent/20 px-3 py-2 text-sm text-muted-foreground">
              No default is saved yet. The next thumbs up or thumbs down choice will ask once and
              then save the answer here.
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {[
              {
                value: "allowed",
                label: "Always allow",
                description: "Share voted AI outputs automatically.",
              },
              {
                value: "not_allowed",
                label: "Don't allow",
                description: "Keep voted AI outputs local only.",
              },
            ].map((option) => {
              const active = feedbackDataSharingPreference === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={updateGeneralMutation.isPending || signOutMutation.isPending}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                    active
                      ? "border-foreground bg-accent text-foreground"
                      : "border-border bg-background hover:bg-accent/50",
                  )}
                  onClick={() =>
                    updateGeneralMutation.mutate({
                      feedbackDataSharingPreference: option.value as
                        | "allowed"
                        | "not_allowed",
                    })
                  }
                >
                  <div className="text-sm font-medium">{option.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {option.description}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            To retest the first-use prompt in local dev, remove the{" "}
            <code>feedbackDataSharingPreference</code> key from the{" "}
            <code>instance_settings.general</code> JSON row for this instance, or set it back to{" "}
            <code>"prompt"</code>. Unset and <code>"prompt"</code> both mean no default has been
            chosen yet.
          </p>
        </div>
      </section>

      <section>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">Sign out</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Sign out of this Paperclip instance. You will be redirected to the login page.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={signOutMutation.isPending || updateGeneralMutation.isPending}
            onClick={() => {
              setActionError(null);
              signOutMutation.mutate();
            }}
          >
            <LogOut className="size-4" />
            {signOutMutation.isPending ? "Signing out..." : "Sign out"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function StatusBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function BrandingSection({
  branding,
  onSave,
  disabled,
}: {
  branding?: InstanceBrandingSettings;
  onSave: (branding: InstanceBrandingSettings) => void;
  disabled: boolean;
}) {
  const [platformName, setPlatformName] = useState(branding?.platformName ?? DEFAULT_INSTANCE_BRANDING.platformName);
  const [tagline, setTagline] = useState(branding?.tagline ?? "");
  const [logoUrl, setLogoUrl] = useState(branding?.logoUrl ?? "");
  const [faviconUrl, setFaviconUrl] = useState(branding?.faviconUrl ?? "");
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (branding) {
      setPlatformName(branding.platformName ?? DEFAULT_INSTANCE_BRANDING.platformName);
      setTagline(branding.tagline ?? "");
      setLogoUrl(branding.logoUrl ?? "");
      setFaviconUrl(branding.faviconUrl ?? "");
    }
  }, [branding]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      platformName: platformName.trim() || DEFAULT_INSTANCE_BRANDING.platformName,
      tagline: tagline.trim() || null,
      logoUrl: logoUrl.trim() || null,
      faviconUrl: faviconUrl.trim() || null,
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  return (
    <section className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Branding & White-labeling</h2>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Customize the platform name, tagline, and logo displayed across headers, browser titles, and emails.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Platform Name</label>
            <Input
              value={platformName}
              onChange={(e) => setPlatformName(e.target.value)}
              placeholder="Paperclip"
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">e.g. "Qinox AI" instead of "Paperclip".</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tagline (optional)</label>
            <Input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Autonomous AI Operations"
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">Subtitle shown on onboarding and splash screens.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Logo URL (optional)</label>
            <Input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">URL to a custom header logo image.</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Favicon URL (optional)</label>
            <Input
              value={faviconUrl}
              onChange={(e) => setFaviconUrl(e.target.value)}
              placeholder="https://example.com/favicon.ico"
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">URL to a custom browser tab icon.</p>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" size="sm" disabled={disabled}>
            Save branding
          </Button>
          {isSaved && <span className="text-xs text-emerald-500 font-medium">Branding saved!</span>}
        </div>
      </form>
    </section>
  );
}

function ThemingSection({
  theming,
  onSave,
  disabled,
}: {
  theming?: InstanceThemingSettings;
  onSave: (theming: InstanceThemingSettings) => void;
  disabled: boolean;
}) {
  const [activeTheme, setActiveTheme] = useState<string | null>(theming?.activeTheme ?? DEFAULT_INSTANCE_THEMING.activeTheme);
  const [customCss, setCustomCss] = useState(theming?.customCss ?? "");
  const [isSaved, setIsSaved] = useState(false);

  const themesQuery = useQuery({
    queryKey: queryKeys.instance.themes,
    queryFn: () => instanceSettingsApi.getThemes(),
  });

  useEffect(() => {
    if (theming) {
      setActiveTheme(theming.activeTheme ?? DEFAULT_INSTANCE_THEMING.activeTheme);
      setCustomCss(theming.customCss ?? "");
    }
  }, [theming]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      activeTheme: activeTheme || null,
      customCss: customCss.trim() ? customCss : null,
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  const themes = themesQuery.data ?? [];

  return (
    <section className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Palette className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Themes & Custom Stylesheets</h2>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Select an active theme stylesheet from the <code>themes/</code> directory or add custom CSS overrides below.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-4">
        <div className="space-y-3">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Available Themes ({themes.length} found)
          </label>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setActiveTheme(null)}
              className={cn(
                "flex flex-col items-start rounded-md border p-3 text-left transition-colors",
                activeTheme === null
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-background hover:bg-accent/50 text-muted-foreground"
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Default</span>
                {activeTheme === null && <Check className="h-4 w-4 text-primary" />}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Standard theme</p>
            </button>

            {themes.map((theme) => {
              const isSelected = activeTheme === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setActiveTheme(theme.id)}
                  className={cn(
                    "flex flex-col items-start rounded-md border p-3 text-left transition-colors",
                    isSelected
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background hover:bg-accent/50 text-muted-foreground"
                  )}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">{theme.name}</span>
                    {isSelected && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  {theme.description && (
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{theme.description}</p>
                  )}
                  {theme.author && (
                    <span className="mt-2 text-xs font-mono text-muted-foreground/70">by {theme.author}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5 pt-2">
          <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Custom CSS Overrides (optional)
          </label>
          <textarea
            value={customCss}
            onChange={(e) => setCustomCss(e.target.value)}
            placeholder="/* Add custom CSS rules here */&#10;:root { --radius: 0.75rem; }"
            rows={4}
            disabled={disabled}
            className="w-full font-mono text-xs rounded-md border border-input bg-transparent px-3 py-2 text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">
            Custom CSS is injected directly into all pages and overrides standard stylesheet rules.
          </p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" size="sm" disabled={disabled}>
            Save theme settings
          </Button>
          {isSaved && <span className="text-xs text-emerald-500 font-medium">Theme settings saved!</span>}
        </div>
      </form>
    </section>
  );
}

const SIDEBAR_ITEMS_CATALOG = [
  {
    category: "Main Navigation",
    items: [
      { id: "new-task", label: "New Task button" },
      { id: "search", label: "Search" },
      { id: "dashboard", label: "Dashboard" },
      { id: "inbox", label: "Inbox" },
      { id: "decisions", label: "Decisions" },
      { id: "status", label: "Status Cards" },
      { id: "board-chat", label: "Conference Room" },
    ],
  },
  {
    category: "Work",
    items: [
      { id: "issues", label: "Tasks" },
      { id: "cases", label: "Cases" },
      { id: "routines", label: "Routines" },
      { id: "pipelines", label: "Pipelines" },
      { id: "goals", label: "Goals" },
      { id: "artifacts", label: "Artifacts" },
      { id: "skills", label: "Skills" },
      { id: "workspaces", label: "Workspaces" },
      { id: "projects", label: "Projects" },
    ],
  },
  {
    category: "Agents & Team",
    items: [
      { id: "agents", label: "Agents List & Org" },
    ],
  },
  {
    category: "Company",
    items: [
      { id: "org", label: "Org Chart" },
      { id: "apps", label: "Apps" },
      { id: "timeline", label: "Timeline" },
      { id: "costs", label: "Costs" },
      { id: "activity", label: "Activity Feed" },
      { id: "company-settings", label: "Company Settings" },
    ],
  },
];

function NavigationSection({
  navigation,
  onSave,
  disabled,
}: {
  navigation?: InstanceNavigationSettings;
  onSave: (navigation: InstanceNavigationSettings) => void;
  disabled: boolean;
}) {
  const [hiddenItems, setHiddenItems] = useState<string[]>(
    navigation?.hiddenSidebarItems ?? DEFAULT_INSTANCE_NAVIGATION.hiddenSidebarItems,
  );
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (navigation) {
      setHiddenItems(navigation.hiddenSidebarItems ?? DEFAULT_INSTANCE_NAVIGATION.hiddenSidebarItems);
    }
  }, [navigation]);

  const toggleItem = (id: string) => {
    setHiddenItems((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ hiddenSidebarItems: hiddenItems });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  return (
    <section className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <LayoutList className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Sidebar Navigation Customizer</h2>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Choose which sidebar navigation items and sections are visible across the platform.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-lg border border-border bg-card p-4">
        {SIDEBAR_ITEMS_CATALOG.map((group) => (
          <div key={group.category} className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {group.category}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((item) => {
                const isVisible = !hiddenItems.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleItem(item.id)}
                    className={cn(
                      "flex items-center justify-between rounded-md border p-2.5 text-left transition-colors",
                      isVisible
                        ? "border-primary/40 bg-primary/5 text-foreground"
                        : "border-border/50 bg-background/50 text-muted-foreground/60 opacity-60",
                    )}
                  >
                    <span className="text-xs font-medium">{item.label}</span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider",
                        isVisible
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {isVisible ? "Visible" : "Hidden"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" size="sm" disabled={disabled}>
            Save navigation settings
          </Button>
          {isSaved && <span className="text-xs text-emerald-500 font-medium">Navigation settings saved!</span>}
        </div>
      </form>
    </section>
  );
}
