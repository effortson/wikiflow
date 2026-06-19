import { getLanguage } from "obsidian";
import { en } from "./en";
import { zh } from "./zh";
import type {
  CommandMessages,
  NoticeMessages,
  ProgressMessages,
  QueryViewMessages,
  SettingsMessages,
  UiLocale,
  UiMessages,
} from "./types";
import type { IngestProgressPhase } from "@shared/types/ingest-progress";

export type { UiLocale, UiMessages } from "./types";

const CATALOG: Record<UiLocale, UiMessages> = { en, zh };

export function resolveUiLocale(code?: string): UiLocale {
  const lang = (code ?? safeGetObsidianLanguage()).toLowerCase();
  if (lang.startsWith("zh")) return "zh";
  return "en";
}

function safeGetObsidianLanguage(): string {
  try {
    return getLanguage();
  } catch {
    return "en";
  }
}

export function formatMessage(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    vars[key] !== undefined ? String(vars[key]) : `{${key}}`,
  );
}

export function messagesForLocale(locale: UiLocale): UiMessages {
  return CATALOG[locale];
}

export function createTranslator(langCode?: string) {
  const locale = (): UiLocale => resolveUiLocale(langCode);
  const messages = (): UiMessages => CATALOG[locale()];

  return {
    locale,
    messages,
    command(name: keyof CommandMessages): string {
      const m = messages();
      return `${m.pluginName}: ${m.commands[name]}`;
    },
    notice(
      name: keyof NoticeMessages,
      vars?: Record<string, string | number>,
    ): string {
      return formatMessage(messages().notices[name], vars);
    },
    ribbon(name: keyof UiMessages["ribbon"]): string {
      return messages().ribbon[name];
    },
    statusBar(
      name: keyof UiMessages["statusBar"],
      vars?: Record<string, string | number>,
    ): string {
      return formatMessage(messages().statusBar[name], vars);
    },
    progressStep(phase: IngestProgressPhase): string {
      const key = PROGRESS_STEP_KEYS[phase];
      return key ? messages().progress[key] : phase;
    },
    progress(name: keyof ProgressMessages, vars?: Record<string, string | number>): string {
      return formatMessage(messages().progress[name], vars);
    },
    settings(): SettingsMessages {
      return messages().settings;
    },
    queryViewMessages(): QueryViewMessages {
      return messages().queryView;
    },
    queryView(
      name: keyof QueryViewMessages,
      vars?: Record<string, string | number>,
    ): string {
      return formatMessage(messages().queryView[name], vars);
    },
  };
}

const PROGRESS_STEP_KEYS: Partial<
  Record<IngestProgressPhase, keyof ProgressMessages>
> = {
  starting: "stepStarting",
  wiki_preparing: "wikiPreparing",
  converting: "stepConverting",
  extracting: "stepExtracting",
  extract_cached: "stepExtractCached",
  analyzing: "stepAnalyzing",
  writing: "stepWriting",
  indexing: "stepIndexing",
  skipping: "stepSkipping",
  complete: "stepComplete",
  failed: "stepFailed",
};
