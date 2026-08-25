import { describe, expect, it } from "vitest";
import { themeService } from "./theme-service.js";

describe("themeService", () => {
  it("lists discovered themes from the repo themes directory", async () => {
    const service = themeService();
    const themes = await service.listThemes();

    expect(themes.length).toBeGreaterThan(0);
    const qinoxTheme = themes.find((t) => t.id === "qinox-dark");
    expect(qinoxTheme).toBeDefined();
    expect(qinoxTheme?.name).toBe("Qinox Dark");
    expect(qinoxTheme?.description).toContain("violet");
  });

  it("serves theme CSS content and rejects path traversal", async () => {
    const service = themeService();
    const css = await service.getThemeCss("qinox-dark");

    expect(css).not.toBeNull();
    expect(css).toContain("--primary: #8b5cf6;");

    const traversal = await service.getThemeCss("../../../etc/passwd");
    expect(traversal).toBeNull();
  });
});
