import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ThemeOption } from "@paperclipai/shared";
import { resolvePaperclipHomeDir } from "../home-paths.js";

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

    // 2. Relative to current module directory (src/services or dist/services)
    try {
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      addDir(path.resolve(currentDir, "../../themes"), false);
      addDir(path.resolve(currentDir, "../../../themes"), false);
      addDir(path.resolve(currentDir, "../themes"), false);
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
    } catch {
      // Ignore directory creation errors
    }
  };

  const listThemes = async (): Promise<ThemeOption[]> => {
    await ensureUserThemesDir();
    const dirs = getThemeDirectories();
    const themesMap = new Map<string, ThemeOption>();

    for (const { dir, isCustom } of dirs) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith(".css")) {
            const filename = entry.name;
            const id = filename.replace(/\.css$/, "");
            if (!themesMap.has(id)) {
              try {
                const filePath = path.join(dir, filename);
                const content = await fs.readFile(filePath, "utf-8");
                themesMap.set(id, parseThemeMetadata(content, id, filename, isCustom));
              } catch {
                // If file read fails, provide fallback entry
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

    return null;
  };

  return {
    listThemes,
    getThemeCss,
    getThemeDirectories,
  };
}

export type ThemeService = ReturnType<typeof themeService>;
