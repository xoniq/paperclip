import type {
  InstanceBrandingSettings,
  InstanceThemingSettings,
  InstanceNavigationSettings,
  InstanceCompanyPermissionsSettings,
  ThemeOption,
  InstanceExperimentalSettingsWithManaged,
  InstanceGeneralSettings,
  InstanceSettings,
  PatchInstanceSettings,
  PatchInstanceGeneralSettings,
  PatchInstanceExperimentalSettings,
} from "@paperclipai/shared";
import { api } from "./client";

export const instanceSettingsApi = {
  get: () =>
    api.get<InstanceSettings>("/instance/settings"),
  update: (patch: PatchInstanceSettings) =>
    api.patch<InstanceSettings>("/instance/settings", patch),
  getBranding: () =>
    api.get<InstanceBrandingSettings>("/instance/branding"),
  getThemes: () =>
    api.get<ThemeOption[]>("/instance/themes"),
  getTheming: () =>
    api.get<InstanceThemingSettings>("/instance/theming"),
  getNavigation: () =>
    api.get<InstanceNavigationSettings>("/instance/navigation"),
  getCompanyPermissions: () =>
    api.get<InstanceCompanyPermissionsSettings>("/instance/company-permissions"),
  getGeneral: () =>
    api.get<InstanceGeneralSettings>("/instance/settings/general"),
  updateGeneral: (patch: PatchInstanceGeneralSettings) =>
    api.patch<InstanceGeneralSettings>("/instance/settings/general", patch),
  getExperimental: () =>
    api.get<InstanceExperimentalSettingsWithManaged>("/instance/settings/experimental"),
  updateExperimental: (patch: PatchInstanceExperimentalSettings) =>
    api.patch<InstanceExperimentalSettingsWithManaged>("/instance/settings/experimental", patch),
};
