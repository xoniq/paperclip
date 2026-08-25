import { describe, expect, it } from "vitest";
import {
  instanceExperimentalSettingsSchema,
  patchInstanceExperimentalSettingsSchema,
  instanceGeneralSettingsSchema,
  instanceBrandingSettingsSchema,
  instanceThemingSettingsSchema,
  themeOptionSchema,
  instanceNavigationSettingsSchema,
  patchInstanceGeneralSettingsSchema,
} from "./instance.js";

describe("instance experimental settings validators", () => {
  it("defaults the server info debug view off", () => {
    const settings = instanceExperimentalSettingsSchema.parse({});

    expect(settings.enableServerInfoDebugView).toBe(false);
  });

  it("defaults workspace branch repair settings on", () => {
    const settings = instanceExperimentalSettingsSchema.parse({});

    expect(settings.enableWorkspaceBranchReconcileForward).toBe(true);
    expect(settings.enableWorkspaceDirtyQuarantineRepair).toBe(true);
  });

  it("defaults the goals sidebar link off", () => {
    const settings = instanceExperimentalSettingsSchema.parse({});

    expect(settings.enableGoalsSidebarLink).toBe(false);
  });

  it("defaults the sandbox duplex bridge kill switch off", () => {
    const settings = instanceExperimentalSettingsSchema.parse({});

    expect(settings.enableSandboxDuplexBridge).toBe(false);
  });

  it("accepts an explicit sandbox duplex bridge kill switch value", () => {
    expect(
      instanceExperimentalSettingsSchema.parse({ enableSandboxDuplexBridge: true })
        .enableSandboxDuplexBridge,
    ).toBe(true);
    expect(
      instanceExperimentalSettingsSchema.parse({ enableSandboxDuplexBridge: false })
        .enableSandboxDuplexBridge,
    ).toBe(false);
  });

  it("accepts the sandbox duplex bridge kill switch in a patch", () => {
    expect(
      patchInstanceExperimentalSettingsSchema.parse({ enableSandboxDuplexBridge: true }),
    ).toEqual({ enableSandboxDuplexBridge: true });
  });

  it("defaults worktree run execution off", () => {
    const settings = instanceExperimentalSettingsSchema.parse({});

    expect(settings.enableWorktreeRunExecution).toBe(false);
    expect(settings.worktreeRunExecutionActivatedAt).toBeNull();
    expect(settings.worktreeRunExecutionActivationInstanceId).toBeNull();
  });

  it("strips server-managed worktree run execution fields from patches", () => {
    expect(
      patchInstanceExperimentalSettingsSchema.parse({
        enableWorktreeRunExecution: true,
        worktreeRunExecutionActivatedAt: "2026-07-10T12:00:00.000Z",
        worktreeRunExecutionActivationInstanceId: "copied-instance",
      }),
    ).toEqual({
      enableWorktreeRunExecution: true,
    });
  });

  it("defaults built-in agents off", () => {
    const settings = instanceExperimentalSettingsSchema.parse({});

    expect(settings.enableBuiltInAgents).toBe(false);
  });

  it("defaults beta skills off", () => {
    const settings = instanceExperimentalSettingsSchema.parse({});

    expect(settings.enableBetaSkills).toBe(false);
  });

  it("defaults apps off", () => {
    const settings = instanceExperimentalSettingsSchema.parse({});

    expect(settings.enableApps).toBe(false);
  });

  it("accepts worktree run execution patches", () => {
    expect(
      patchInstanceExperimentalSettingsSchema.parse({
        enableWorktreeRunExecution: true,
      }),
    ).toEqual({
      enableWorktreeRunExecution: true,
    });
  });

  it("defaults the decisions sidebar link off", () => {
    const settings = instanceExperimentalSettingsSchema.parse({});

    expect(settings.enableDecisions).toBe(false);
  });

  it("accepts decisions patches", () => {
    expect(
      patchInstanceExperimentalSettingsSchema.parse({
        enableDecisions: true,
      }),
    ).toEqual({
      enableDecisions: true,
    });
  });

  it("accepts server info debug view patches", () => {
    expect(
      patchInstanceExperimentalSettingsSchema.parse({
        enableServerInfoDebugView: true,
      }),
    ).toEqual({
      enableServerInfoDebugView: true,
    });
  });

  it("accepts workspace branch forward reconciliation patches", () => {
    expect(
      patchInstanceExperimentalSettingsSchema.parse({
        enableWorkspaceBranchReconcileForward: false,
        enableWorkspaceDirtyQuarantineRepair: false,
      }),
    ).toEqual({
      enableWorkspaceBranchReconcileForward: false,
      enableWorkspaceDirtyQuarantineRepair: false,
    });
  });

  it("accepts goals sidebar link patches", () => {
    expect(
      patchInstanceExperimentalSettingsSchema.parse({
        enableGoalsSidebarLink: true,
      }),
    ).toEqual({
      enableGoalsSidebarLink: true,
    });
  });

  it("accepts built-in agents patches", () => {
    expect(
      patchInstanceExperimentalSettingsSchema.parse({
        enableBuiltInAgents: true,
      }),
    ).toEqual({
      enableBuiltInAgents: true,
    });
  });

  it("accepts apps patches", () => {
    expect(
      patchInstanceExperimentalSettingsSchema.parse({
        enableApps: true,
      }),
    ).toEqual({
      enableApps: true,
    });
  });
});

describe("instance branding settings validators", () => {
  it("defaults to Paperclip platform branding", () => {
    const general = instanceGeneralSettingsSchema.parse({});
    expect(general.branding).toEqual({
      platformName: "Paperclip",
      logoUrl: null,
      faviconUrl: null,
      tagline: null,
    });
  });

  it("parses custom branding and validates patch", () => {
    const branding = instanceBrandingSettingsSchema.parse({
      platformName: "Qinox AI",
      tagline: "Autonomous AI Operations",
      logoUrl: "https://example.com/logo.png",
      faviconUrl: "https://example.com/favicon.ico",
    });
    expect(branding.platformName).toBe("Qinox AI");
    expect(branding.tagline).toBe("Autonomous AI Operations");
    expect(branding.logoUrl).toBe("https://example.com/logo.png");
    expect(branding.faviconUrl).toBe("https://example.com/favicon.ico");

    const patch = patchInstanceGeneralSettingsSchema.parse({
      branding: {
        platformName: "Custom Platform",
      },
    });
    expect(patch.branding?.platformName).toBe("Custom Platform");
  });
});

describe("instance theming settings validators", () => {
  it("defaults to null theming settings", () => {
    const general = instanceGeneralSettingsSchema.parse({});
    expect(general.theming).toEqual({
      activeTheme: null,
      customCss: null,
    });
  });

  it("parses theme option and validates theming patch", () => {
    const theme = themeOptionSchema.parse({
      id: "qinox-dark",
      name: "Qinox Dark",
      filename: "qinox-dark.css",
      description: "Sleek dark theme",
      author: "Qinox AI",
    });
    expect(theme.id).toBe("qinox-dark");
    expect(theme.name).toBe("Qinox Dark");

    const theming = instanceThemingSettingsSchema.parse({
      activeTheme: "qinox-dark",
      customCss: ":root { --primary: #8b5cf6; }",
    });
    expect(theming.activeTheme).toBe("qinox-dark");
    expect(theming.customCss).toContain("--primary");

    const patch = patchInstanceGeneralSettingsSchema.parse({
      theming: {
        activeTheme: "midnight-blue",
      },
    });
    expect(patch.theming?.activeTheme).toBe("midnight-blue");
  });
});

describe("instance navigation settings validators", () => {
  it("defaults to empty hidden sidebar items", () => {
    const general = instanceGeneralSettingsSchema.parse({});
    expect(general.navigation).toEqual({
      hiddenSidebarItems: [],
    });
  });

  it("parses hidden sidebar items and validates patch", () => {
    const nav = instanceNavigationSettingsSchema.parse({
      hiddenSidebarItems: ["pipelines", "cases", "routines"],
    });
    expect(nav.hiddenSidebarItems).toEqual(["pipelines", "cases", "routines"]);

    const patch = patchInstanceGeneralSettingsSchema.parse({
      navigation: {
        hiddenSidebarItems: ["costs", "activity"],
      },
    });
    expect(patch.navigation?.hiddenSidebarItems).toEqual(["costs", "activity"]);
  });
});



