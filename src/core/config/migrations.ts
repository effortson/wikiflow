import { normalizeWikiLanguage } from "@shared/wiki-language";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  SETTINGS_VERSION,
  type PluginSettings,
} from "./settings";

export function migrateSettings(
  raw: Partial<PluginSettings> | null | undefined,
): PluginSettings {
  const version = raw?.settingsVersion ?? 0;
  let settings = mergeSettings(raw);

  if (version < SETTINGS_VERSION) {
    settings = { ...settings, settingsVersion: SETTINGS_VERSION };
  }

  settings.language = normalizeWikiLanguage(settings.language);

  return settings;
}

export { DEFAULT_SETTINGS, SETTINGS_VERSION };
