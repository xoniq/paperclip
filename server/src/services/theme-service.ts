import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ThemeOption } from "@paperclipai/shared";
import { resolvePaperclipHomeDir } from "../home-paths.js";

const BUNDLED_THEMES: Record<string, string> = {
  "qinox-ai.css": `/*
 * Name: Qinox AI
 * Description: Official Qinox AI signature theme with obsidian base, vibrant cyan & mint accents, frosted glass panels, and crisp typography for both light and dark modes.
 * Author: Qinox AI (qinox.nl)
 */

:root {
  --font-sans: "InterVariable", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  --font-heading: var(--font-sans);
  --radius: 0.5rem;
  --background: #f7f9fc;
  --foreground: #090b10;
  --card: #ffffff;
  --card-foreground: #090b10;
  --popover: #ffffff;
  --popover-foreground: #090b10;
  --primary: #0284c7;
  --primary-foreground: #ffffff;
  --secondary: #eef2f6;
  --secondary-foreground: #090b10;
  --muted: #eef2f6;
  --muted-foreground: #64748b;
  --accent: #e0f7f6;
  --accent-foreground: #0f766e;
  --destructive: #ef4444;
  --destructive-foreground: #ffffff;
  --border: #e2e8f0;
  --input: #e2e8f0;
  --ring: #0284c7;
  --sidebar: #f0f4f9;
  --sidebar-foreground: #090b10;
  --sidebar-primary: #0284c7;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #e2e8f0;
  --sidebar-accent-foreground: #090b10;
  --sidebar-border: #e2e8f0;
  --sidebar-ring: #0284c7;
  --status-agent-idle: #94a3b8;
  --status-agent-running: #0284c7;
  --status-agent-paused: #f59e0b;
  --status-agent-error: #ef4444;
  --status-task-backlog: #94a3b8;
  --status-task-todo: #f59e0b;
  --status-task-in_progress: #0284c7;
  --status-task-in_review: #6366f1;
  --status-task-done: #10b981;
  --status-task-blocked: #ef4444;
  --status-task-cancelled: #94a3b8;
  --status-task-icon-backlog: #64748b;
  --status-task-icon-todo: #d97706;
  --status-task-icon-in_progress: #0284c7;
  --status-task-icon-in_review: #4f46e5;
  --status-task-icon-done: #059669;
  --status-task-icon-blocked: #dc2626;
  --status-task-icon-cancelled: #64748b;
  --status-task-icon-in_queue: #0284c7;
  --chart-1: #0284c7;
  --chart-2: #0d9488;
  --chart-3: #10b981;
  --chart-4: #f59e0b;
  --chart-5: #6366f1;
}

.dark {
  --background: #07090d;
  --foreground: #f3f5f8;
  --card: #0c1017;
  --card-foreground: #f3f5f8;
  --popover: #0c1017;
  --popover-foreground: #f3f5f8;
  --primary: #44d8ff;
  --primary-foreground: #07090d;
  --secondary: #131722;
  --secondary-foreground: #f3f5f8;
  --muted: #131722;
  --muted-foreground: #9ea7b7;
  --accent: #0f2430;
  --accent-foreground: #78f0d5;
  --destructive: #ef4444;
  --destructive-foreground: #ffffff;
  --border: #1a2232;
  --input: #1a2232;
  --ring: #44d8ff;
  --sidebar: #090b10;
  --sidebar-foreground: #f3f5f8;
  --sidebar-primary: #44d8ff;
  --sidebar-primary-foreground: #07090d;
  --sidebar-accent: #131722;
  --sidebar-accent-foreground: #78f0d5;
  --sidebar-border: #1a2232;
  --sidebar-ring: #44d8ff;
  --status-agent-idle: #9ea7b7;
  --status-agent-running: #44d8ff;
  --status-agent-paused: #f59e0b;
  --status-agent-error: #ef4444;
  --status-task-backlog: #9ea7b7;
  --status-task-todo: #f59e0b;
  --status-task-in_progress: #44d8ff;
  --status-task-in_review: #a78bfa;
  --status-task-done: #78f0d5;
  --status-task-blocked: #ef4444;
  --status-task-cancelled: #9ea7b7;
  --status-task-icon-backlog: #9ea7b7;
  --status-task-icon-todo: #fbbf24;
  --status-task-icon-in_progress: #44d8ff;
  --status-task-icon-in_review: #c4b5fd;
  --status-task-icon-done: #78f0d5;
  --status-task-icon-blocked: #f87171;
  --status-task-icon-cancelled: #9ea7b7;
  --status-task-icon-in_queue: #44d8ff;
  --chart-1: #44d8ff;
  --chart-2: #78f0d5;
  --chart-3: #38bdf8;
  --chart-4: #fbbf24;
  --chart-5: #a78bfa;
}
`,
  "master-default.css": `/*
 * Name: Master Default Theme
 * Description: Master theme and comprehensive reference stylesheet containing every customizable UI token, color role, status hue, chart palette, sidebar variable, corner radius, agent gradient, and component override.
 * Author: Qinox AI
 */

:root {
  --font-sans: "InterVariable", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  --font-heading: var(--font-sans);
  --radius: 0.5rem;
  --background: #f8fafc;
  --foreground: #0f172a;
  --card: #ffffff;
  --card-foreground: #0f172a;
  --popover: #ffffff;
  --popover-foreground: #0f172a;
  --primary: #4f46e5;
  --primary-foreground: #ffffff;
  --secondary: #f1f5f9;
  --secondary-foreground: #0f172a;
  --muted: #f1f5f9;
  --muted-foreground: #64748b;
  --accent: #e0e7ff;
  --accent-foreground: #3730a3;
  --destructive: #ef4444;
  --destructive-foreground: #ffffff;
  --border: #e2e8f0;
  --input: #e2e8f0;
  --ring: #6366f1;
  --sidebar: #ffffff;
  --sidebar-foreground: #0f172a;
  --sidebar-primary: #4f46e5;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #f1f5f9;
  --sidebar-accent-foreground: #0f172a;
  --sidebar-border: #e2e8f0;
  --sidebar-ring: #6366f1;
  --status-agent-idle: #94a3b8;
  --status-agent-running: #3b82f6;
  --status-agent-paused: #f59e0b;
  --status-agent-error: #ef4444;
  --status-task-backlog: #94a3b8;
  --status-task-todo: #f59e0b;
  --status-task-in_progress: #3b82f6;
  --status-task-in_review: #8b5cf6;
  --status-task-done: #10b981;
  --status-task-blocked: #ef4444;
  --status-task-cancelled: #94a3b8;
  --status-task-icon-backlog: #64748b;
  --status-task-icon-todo: #d97706;
  --status-task-icon-in_progress: #2563eb;
  --status-task-icon-in_review: #7c3aed;
  --status-task-icon-done: #059669;
  --status-task-icon-blocked: #dc2626;
  --status-task-icon-cancelled: #64748b;
  --status-task-icon-in_queue: #2563eb;
  --chart-1: #4f46e5;
  --chart-2: #06b6d4;
  --chart-3: #10b981;
  --chart-4: #f59e0b;
  --chart-5: #ec4899;
}

.dark {
  --background: #090d16;
  --foreground: #f8fafc;
  --card: #0f172a;
  --card-foreground: #f8fafc;
  --popover: #0f172a;
  --popover-foreground: #f8fafc;
  --primary: #6366f1;
  --primary-foreground: #ffffff;
  --secondary: #1e293b;
  --secondary-foreground: #f8fafc;
  --muted: #1e293b;
  --muted-foreground: #94a3b8;
  --accent: #2e1065;
  --accent-foreground: #e0e7ff;
  --destructive: #ef4444;
  --destructive-foreground: #ffffff;
  --border: #1e293b;
  --input: #1e293b;
  --ring: #6366f1;
  --sidebar: #0b0f19;
  --sidebar-foreground: #f8fafc;
  --sidebar-primary: #6366f1;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #1e293b;
  --sidebar-accent-foreground: #f8fafc;
  --sidebar-border: #1e293b;
  --sidebar-ring: #6366f1;
  --status-task-icon-backlog: #94a3b8;
  --status-task-icon-todo: #fbbf24;
  --status-task-icon-in_review: #a78bfa;
  --status-task-icon-done: #34d399;
  --status-task-icon-cancelled: #94a3b8;
  --chart-1: #818cf8;
  --chart-2: #22d3ee;
  --chart-3: #34d399;
  --chart-4: #fbbf24;
  --chart-5: #f472b6;
}
`,
  "qinox-dark.css": `/*
 * Name: Qinox Dark
 * Description: Sleek dark theme with rich violet accents, emerald status hues, and obsidian panels
 * Author: Qinox AI
 */

:root, .dark {
  --background: #0b0f19;
  --foreground: #f1f5f9;
  --card: #111827;
  --card-foreground: #f8fafc;
  --popover: #111827;
  --popover-foreground: #f8fafc;
  --primary: #8b5cf6;
  --primary-foreground: #ffffff;
  --secondary: #1e293b;
  --secondary-foreground: #f1f5f9;
  --muted: #1e293b;
  --muted-foreground: #94a3b8;
  --accent: #2e1065;
  --accent-foreground: #ddd6fe;
  --destructive: #ef4444;
  --destructive-foreground: #ffffff;
  --border: #1f293d;
  --input: #1f293d;
  --ring: #8b5cf6;
  --sidebar: #0d121f;
  --sidebar-foreground: #f1f5f9;
  --sidebar-primary: #8b5cf6;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #1e293b;
  --sidebar-accent-foreground: #f1f5f9;
  --sidebar-border: #1f293d;
}
`,
  "midnight-blue.css": `/*
 * Name: Midnight Blue
 * Description: Deep sapphire night aesthetic with vivid electric blue glows
 * Author: Qinox AI
 */

:root, .dark {
  --background: #090d16;
  --foreground: #f0f6fc;
  --card: #0f172a;
  --card-foreground: #f0f6fc;
  --popover: #0f172a;
  --popover-foreground: #f0f6fc;
  --primary: #38bdf8;
  --primary-foreground: #082f49;
  --secondary: #1e293b;
  --secondary-foreground: #f0f6fc;
  --muted: #1e293b;
  --muted-foreground: #94a3b8;
  --accent: #0369a1;
  --accent-foreground: #e0f2fe;
  --destructive: #f43f5e;
  --destructive-foreground: #ffffff;
  --border: #1e293b;
  --input: #1e293b;
  --ring: #38bdf8;
  --sidebar: #0b1120;
  --sidebar-foreground: #f0f6fc;
  --sidebar-primary: #38bdf8;
  --sidebar-primary-foreground: #082f49;
  --sidebar-accent: #1e293b;
  --sidebar-accent-foreground: #f0f6fc;
  --sidebar-border: #1e293b;
}
`,
  "emerald-terminal.css": `/*
 * Name: Emerald Terminal
 * Description: Cyberpunk-inspired terminal palette with luminous emerald accents
 * Author: Qinox AI
 */

:root, .dark {
  --background: #050d0a;
  --foreground: #ecfdf5;
  --card: #091712;
  --card-foreground: #ecfdf5;
  --popover: #091712;
  --popover-foreground: #ecfdf5;
  --primary: #10b981;
  --primary-foreground: #022c22;
  --secondary: #132e24;
  --secondary-foreground: #ecfdf5;
  --muted: #132e24;
  --muted-foreground: #6ee7b7;
  --accent: #064e3b;
  --accent-foreground: #a7f3d0;
  --destructive: #f87171;
  --destructive-foreground: #ffffff;
  --border: #164e3b;
  --input: #164e3b;
  --ring: #10b981;
  --sidebar: #040a08;
  --sidebar-foreground: #ecfdf5;
  --sidebar-primary: #10b981;
  --sidebar-primary-foreground: #022c22;
  --sidebar-accent: #132e24;
  --sidebar-accent-foreground: #ecfdf5;
  --sidebar-border: #164e3b;
}
`,
  "nordic-slate.css": `/*
 * Name: Nordic Slate
 * Description: Clean, frosty arctic slate with ice-blue focus accents
 * Author: Qinox AI
 */

:root, .dark {
  --background: #181d24;
  --foreground: #eceff4;
  --card: #202630;
  --card-foreground: #eceff4;
  --popover: #202630;
  --popover-foreground: #eceff4;
  --primary: #88c0d0;
  --primary-foreground: #2e3440;
  --secondary: #2e3440;
  --secondary-foreground: #eceff4;
  --muted: #2e3440;
  --muted-foreground: #d8dee9;
  --accent: #3b4252;
  --accent-foreground: #eceff4;
  --destructive: #bf616a;
  --destructive-foreground: #ffffff;
  --border: #3b4252;
  --input: #3b4252;
  --ring: #88c0d0;
  --sidebar: #151920;
  --sidebar-foreground: #eceff4;
  --sidebar-primary: #88c0d0;
  --sidebar-primary-foreground: #2e3440;
  --sidebar-accent: #2e3440;
  --sidebar-accent-foreground: #eceff4;
  --sidebar-border: #3b4252;
}
`,
  "mission-control.css": `/*
 * Name: Mission Control (187N)
 * Description: Warm editorial aesthetic inspired by 187N Mission Control. Features warm ivory/sand canvas, coral-orange active states, generous rounded cards, pill tags, and warm obsidian dark mode.
 * Author: Qinox AI
 */

:root {
  --font-sans: "InterVariable", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  --font-heading: var(--font-sans);
  --radius: 0.875rem;
  --background: #faf8f5;
  --foreground: #1c1917;
  --card: #ffffff;
  --card-foreground: #1c1917;
  --popover: #ffffff;
  --popover-foreground: #1c1917;
  --primary: #f97316;
  --primary-foreground: #ffffff;
  --secondary: #f4efe9;
  --secondary-foreground: #1c1917;
  --muted: #f4efe9;
  --muted-foreground: #78716c;
  --accent: #fff0e6;
  --accent-foreground: #ea580c;
  --destructive: #ef4444;
  --destructive-foreground: #ffffff;
  --border: #ece5dc;
  --input: #ece5dc;
  --ring: #f97316;
  --sidebar: #f7f4ef;
  --sidebar-foreground: #44403c;
  --sidebar-primary: #f97316;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #fff0e6;
  --sidebar-accent-foreground: #ea580c;
  --sidebar-border: #eae2d7;
  --sidebar-ring: #f97316;
  --status-agent-idle: #a8a29e;
  --status-agent-running: #f97316;
  --status-agent-paused: #f59e0b;
  --status-agent-error: #ef4444;
  --status-task-backlog: #a8a29e;
  --status-task-todo: #f97316;
  --status-task-in_progress: #f97316;
  --status-task-in_review: #8b5cf6;
  --status-task-done: #10b981;
  --status-task-blocked: #ef4444;
  --status-task-cancelled: #a8a29e;
  --status-task-icon-backlog: #78716c;
  --status-task-icon-todo: #ea580c;
  --status-task-icon-in_progress: #ea580c;
  --status-task-icon-in_review: #7c3aed;
  --status-task-icon-done: #059669;
  --status-task-icon-blocked: #dc2626;
  --status-task-icon-cancelled: #78716c;
  --status-task-icon-in_queue: #ea580c;
  --chart-1: #f97316;
  --chart-2: #38bdf8;
  --chart-3: #10b981;
  --chart-4: #f59e0b;
  --chart-5: #a855f7;
}

.dark {
  --background: #121110;
  --foreground: #f5f2ed;
  --card: #1c1916;
  --card-foreground: #f5f2ed;
  --popover: #1c1916;
  --popover-foreground: #f5f2ed;
  --primary: #ff8442;
  --primary-foreground: #121110;
  --secondary: #26221d;
  --secondary-foreground: #f5f2ed;
  --muted: #26221d;
  --muted-foreground: #a89f91;
  --accent: #331f13;
  --accent-foreground: #ff9d66;
  --destructive: #f87171;
  --destructive-foreground: #ffffff;
  --border: #2e2821;
  --input: #2e2821;
  --ring: #ff8442;
  --sidebar: #0f0e0c;
  --sidebar-foreground: #d6cfc5;
  --sidebar-primary: #ff8442;
  --sidebar-primary-foreground: #121110;
  --sidebar-accent: #261b12;
  --sidebar-accent-foreground: #ff9d66;
  --sidebar-border: #241e17;
  --sidebar-ring: #ff8442;
  --status-agent-idle: #a89f91;
  --status-agent-running: #ff8442;
  --status-agent-paused: #f59e0b;
  --status-agent-error: #f87171;
  --status-task-backlog: #a89f91;
  --status-task-todo: #ff8442;
  --status-task-in_progress: #ff8442;
  --status-task-in_review: #c084fc;
  --status-task-done: #34d399;
  --status-task-blocked: #f87171;
  --status-task-cancelled: #a89f91;
  --status-task-icon-backlog: #a89f91;
  --status-task-icon-todo: #ff9d66;
  --status-task-icon-in_progress: #ff9d66;
  --status-task-icon-in_review: #d8b4fe;
  --status-task-icon-done: #34d399;
  --status-task-icon-blocked: #f87171;
  --status-task-icon-cancelled: #a89f91;
  --status-task-icon-in_queue: #ff8442;
  --chart-1: #ff8442;
  --chart-2: #60a5fa;
  --chart-3: #34d399;
  --chart-4: #fbbf24;
  --chart-5: #c084fc;
}
`,
};

function formatThemeName(id: string): string {
  return id
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseThemeMetadata(content: string, id: string, filename: string, isCustom: boolean): ThemeOption {
  let name = formatThemeName(id);
  let description: string | undefined;
  let author: string | undefined;

  const headerMatch = content.match(/\/\*([\s\S]*?)\*\//);
  if (headerMatch) {
    const lines = headerMatch[1].split("\n");
    for (const line of lines) {
      const trimmed = line.replace(/^\s*\*\s?/, "").trim();
      const nameMatch = trimmed.match(/^Name:\s*(.+)$/i);
      const descMatch = trimmed.match(/^Description:\s*(.+)$/i);
      const authorMatch = trimmed.match(/^Author:\s*(.+)$/i);

      if (nameMatch) name = nameMatch[1].trim();
      if (descMatch) description = descMatch[1].trim();
      if (authorMatch) author = authorMatch[1].trim();
    }
  }

  return {
    id,
    name,
    filename,
    description,
    author,
    isCustom,
  };
}

export function themeService() {
  const getThemeDirectories = (): { dir: string; isCustom: boolean }[] => {
    const dirs: { dir: string; isCustom: boolean }[] = [];
    const seen = new Set<string>();

    const addDir = (dir: string, isCustom: boolean) => {
      const resolved = path.resolve(dir);
      if (!seen.has(resolved)) {
        seen.add(resolved);
        dirs.push({ dir: resolved, isCustom });
      }
    };

    // 1. Bundled / workspace themes directory relative to process cwd
    addDir(path.resolve(process.cwd(), "themes"), false);
    addDir(path.resolve(process.cwd(), "../themes"), false);
    addDir(path.resolve(process.cwd(), "dist/themes"), false);

    // 2. Relative to current module directory (src/services or dist/services)
    try {
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      addDir(path.resolve(currentDir, "../../themes"), false);
      addDir(path.resolve(currentDir, "../../../themes"), false);
      addDir(path.resolve(currentDir, "../themes"), false);
      addDir(path.resolve(currentDir, "themes"), false);
    } catch {
      // Ignore if fileURLToPath is unavailable
    }

    // 3. User home themes directory (~/.paperclip/themes)
    const homeDir = resolvePaperclipHomeDir();
    const userThemesDir = path.join(homeDir, "themes");
    addDir(userThemesDir, true);

    return dirs;
  };

  const ensureUserThemesDir = async () => {
    try {
      const homeDir = resolvePaperclipHomeDir();
      const userThemesDir = path.join(homeDir, "themes");
      await fs.mkdir(userThemesDir, { recursive: true });

      // Automatically seed bundled themes into userThemesDir if missing
      for (const [filename, content] of Object.entries(BUNDLED_THEMES)) {
        const destFile = path.join(userThemesDir, filename);
        try {
          await fs.access(destFile);
        } catch {
          await fs.writeFile(destFile, content, "utf-8");
        }
      }
    } catch {
      // Ignore directory creation errors
    }
  };

  const listThemes = async (): Promise<ThemeOption[]> => {
    await ensureUserThemesDir();
    const dirs = getThemeDirectories();
    const themesMap = new Map<string, ThemeOption>();

    // Seed default bundled themes first
    for (const [filename, content] of Object.entries(BUNDLED_THEMES)) {
      const id = filename.replace(/\.css$/, "");
      themesMap.set(id, parseThemeMetadata(content, id, filename, false));
    }

    for (const { dir, isCustom } of dirs) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith(".css")) {
            const filename = entry.name;
            const id = filename.replace(/\.css$/, "");
            try {
              const filePath = path.join(dir, filename);
              const content = await fs.readFile(filePath, "utf-8");
              // If it's in userThemesDir and modified/created by user, mark as custom
              const isUserCustom = isCustom && !BUNDLED_THEMES[filename];
              themesMap.set(id, parseThemeMetadata(content, id, filename, isUserCustom));
            } catch {
              if (!themesMap.has(id)) {
                themesMap.set(id, {
                  id,
                  name: formatThemeName(id),
                  filename,
                  isCustom,
                });
              }
            }
          }
        }
      } catch {
        // Directory may not exist yet, skip
      }
    }

    return Array.from(themesMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  };

  const getThemeCss = async (idOrFilename: string): Promise<string | null> => {
    const cleanId = path.basename(idOrFilename).replace(/\.css$/, "");
    if (!cleanId || cleanId.includes("..") || cleanId.includes("/") || cleanId.includes("\\")) {
      return null;
    }

    const filename = `${cleanId}.css`;
    const dirs = getThemeDirectories();

    for (const { dir } of dirs) {
      try {
        const filePath = path.join(dir, filename);
        const content = await fs.readFile(filePath, "utf-8");
        return content;
      } catch {
        // Try next directory
      }
    }

    // Fallback to embedded bundled theme if not found on disk
    if (BUNDLED_THEMES[filename]) {
      return BUNDLED_THEMES[filename];
    }

    return null;
  };

  return {
    listThemes,
    getThemeCss,
    getThemeDirectories,
  };
}

export type ThemeService = ReturnType<typeof themeService>;

