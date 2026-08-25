import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { DEFAULT_INSTANCE_NAVIGATION } from "@paperclipai/shared";
import { instanceSettingsApi } from "../api/instanceSettings";
import { queryKeys } from "../lib/queryKeys";

interface NavigationCustomizerContextValue {
  hiddenSidebarItems: string[];
  isItemHidden: (itemKey: string) => boolean;
  isLoading: boolean;
}

const NavigationCustomizerContext = createContext<NavigationCustomizerContextValue>({
  hiddenSidebarItems: DEFAULT_INSTANCE_NAVIGATION.hiddenSidebarItems,
  isItemHidden: () => false,
  isLoading: false,
});

export function NavigationCustomizerProvider({ children }: { children: ReactNode }) {
  const { data: navData, isLoading } = useQuery({
    queryKey: queryKeys.instance.navigation,
    queryFn: () => instanceSettingsApi.getNavigation(),
    staleTime: 5 * 60 * 1000,
  });

  const hiddenSidebarItems = navData?.hiddenSidebarItems ?? DEFAULT_INSTANCE_NAVIGATION.hiddenSidebarItems;

  const hiddenSet = useMemo(() => new Set(hiddenSidebarItems), [hiddenSidebarItems]);

  const value = useMemo<NavigationCustomizerContextValue>(
    () => ({
      hiddenSidebarItems,
      isItemHidden: (itemKey: string) => hiddenSet.has(itemKey),
      isLoading,
    }),
    [hiddenSidebarItems, hiddenSet, isLoading],
  );

  return <NavigationCustomizerContext.Provider value={value}>{children}</NavigationCustomizerContext.Provider>;
}

export function useNavigationCustomizer(): NavigationCustomizerContextValue {
  return useContext(NavigationCustomizerContext);
}
