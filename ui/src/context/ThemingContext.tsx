import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_INSTANCE_THEMING, type InstanceThemingSettings, type ThemeOption } from "@paperclipai/shared";
import { instanceSettingsApi } from "../api/instanceSettings";
import { queryKeys } from "../lib/queryKeys";

interface ThemingContextValue extends InstanceThemingSettings {
  availableThemes: ThemeOption[];
  isLoading: boolean;
}

const ThemingContext = createContext<ThemingContextValue>({
  ...DEFAULT_INSTANCE_THEMING,
  availableThemes: [],
  isLoading: false,
});

export function ThemingProvider({ children }: { children: ReactNode }) {
  const themingQuery = useQuery({
    queryKey: queryKeys.instance.theming,
    queryFn: () => instanceSettingsApi.getTheming(),
    staleTime: 5 * 60 * 1000,
  });

  const themesQuery = useQuery({
    queryKey: queryKeys.instance.themes,
    queryFn: () => instanceSettingsApi.getThemes(),
    staleTime: 5 * 60 * 1000,
  });

  const activeTheme = themingQuery.data?.activeTheme ?? DEFAULT_INSTANCE_THEMING.activeTheme;
  const customCss = themingQuery.data?.customCss ?? DEFAULT_INSTANCE_THEMING.customCss;

  // Live CSS stylesheet link injection
  useEffect(() => {
    const linkId = "paperclip-active-theme-link";
    let link = document.getElementById(linkId) as HTMLLinkElement | null;

    if (activeTheme) {
      if (!link) {
        link = document.createElement("link");
        link.id = linkId;
        link.rel = "stylesheet";
        document.head.appendChild(link);
      }
      link.href = `/api/instance/themes/${encodeURIComponent(activeTheme)}/css`;
    } else if (link) {
      link.remove();
    }
  }, [activeTheme]);

  // Live custom CSS style tag injection
  useEffect(() => {
    const styleId = "paperclip-custom-css-style";
    let style = document.getElementById(styleId) as HTMLStyleElement | null;

    if (customCss && customCss.trim().length > 0) {
      if (!style) {
        style = document.createElement("style");
        style.id = styleId;
        document.head.appendChild(style);
      }
      style.textContent = customCss;
    } else if (style) {
      style.remove();
    }
  }, [customCss]);

  const value = useMemo<ThemingContextValue>(
    () => ({
      activeTheme,
      customCss,
      availableThemes: themesQuery.data ?? [],
      isLoading: themingQuery.isLoading || themesQuery.isLoading,
    }),
    [activeTheme, customCss, themesQuery.data, themingQuery.isLoading, themesQuery.isLoading],
  );

  return <ThemingContext.Provider value={value}>{children}</ThemingContext.Provider>;
}

export function useTheming(): ThemingContextValue {
  return useContext(ThemingContext);
}
