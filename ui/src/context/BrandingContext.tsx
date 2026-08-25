import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_INSTANCE_BRANDING, type InstanceBrandingSettings } from "@paperclipai/shared";
import { instanceSettingsApi } from "../api/instanceSettings";
import { queryKeys } from "../lib/queryKeys";

interface BrandingContextValue extends InstanceBrandingSettings {
  isLoading: boolean;
}

const BrandingContext = createContext<BrandingContextValue>({
  ...DEFAULT_INSTANCE_BRANDING,
  isLoading: false,
});

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { data: brandingData, isLoading } = useQuery({
    queryKey: queryKeys.instance.branding,
    queryFn: () => instanceSettingsApi.getBranding(),
    staleTime: 5 * 60 * 1000,
  });

  const branding = useMemo<InstanceBrandingSettings>(() => {
    return {
      platformName: brandingData?.platformName?.trim() || DEFAULT_INSTANCE_BRANDING.platformName,
      logoUrl: brandingData?.logoUrl?.trim() || DEFAULT_INSTANCE_BRANDING.logoUrl,
      faviconUrl: brandingData?.faviconUrl?.trim() || DEFAULT_INSTANCE_BRANDING.faviconUrl,
      tagline: brandingData?.tagline?.trim() || DEFAULT_INSTANCE_BRANDING.tagline,
    };
  }, [brandingData]);

  // Dynamically update document title if it contains "Paperclip"
  useEffect(() => {
    if (branding.platformName && branding.platformName !== "Paperclip") {
      if (document.title.includes("Paperclip")) {
        document.title = document.title.replaceAll("Paperclip", branding.platformName);
      }
    }
  }, [branding.platformName]);

  // Dynamically update favicon if faviconUrl is specified
  useEffect(() => {
    if (branding.faviconUrl) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = branding.faviconUrl;
    }
  }, [branding.faviconUrl]);

  const value = useMemo(
    () => ({
      ...branding,
      isLoading,
    }),
    [branding, isLoading],
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): BrandingContextValue {
  return useContext(BrandingContext);
}
