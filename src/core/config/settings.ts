import type { BackupSettings } from "@shared/types/backup";
import {
  DEFAULT_WIKI_LANGUAGE,
  type WikiLanguage,
} from "@shared/wiki-language";

export const SETTINGS_VERSION = 1;

export interface PluginSettings {
  settingsVersion: number;

  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  llmReady: boolean;

  rawFolder: string;
  sourceFolder: string;
  wikiRoot: string;
  schemaRoot: string;
  workflowsFolder: string;

  activeWikiId?: string;

  language: WikiLanguage;
  extractionGranularity:
    | "minimal"
    | "coarse"
    | "standard"
    | "fine"
    | "custom";
  pageGenerationConcurrency: number;

  defaultOcr: "off" | "auto" | "force";
  extractCacheEnabled: boolean;

  maxConcurrentWorkflowRuns: number;
  maxWorkflowNestingDepth: number;
  workflowRunRetentionDays: number;
  workflowRunRetentionCount: number;

  fileAddedDebounceSeconds: number;

  debug: boolean;

  /** Wiki Q&A custom prompts; empty uses built-in defaults. */
  querySystemPrompt?: string;
  queryUserPrompt?: string;

  backup: BackupSettings;
}

const DEFAULT_BACKUP_COMMON = {
  scope: "wikiflow" as const,
  includeExtractCache: false,
  excludePatterns: [] as string[],
  scheduleEnabled: false,
  scheduleIntervalHours: 24,
  retentionCount: 10,
};

export const DEFAULT_SETTINGS: PluginSettings = {
  settingsVersion: SETTINGS_VERSION,

  provider: "openai",
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  llmReady: false,

  rawFolder: "raw",
  sourceFolder: "source",
  wikiRoot: "wiki",
  schemaRoot: "schema",
  workflowsFolder: "workflows",

  language: DEFAULT_WIKI_LANGUAGE,
  extractionGranularity: "standard",
  pageGenerationConcurrency: 2,

  defaultOcr: "auto",
  extractCacheEnabled: true,

  maxConcurrentWorkflowRuns: 2,
  maxWorkflowNestingDepth: 8,
  workflowRunRetentionDays: 30,
  workflowRunRetentionCount: 100,

  fileAddedDebounceSeconds: 5,

  debug: false,

  backup: { provider: "none", ...DEFAULT_BACKUP_COMMON },
};

function mergeBackupSettings(
  loaded: Partial<BackupSettings> | undefined,
): BackupSettings {
  if (!loaded?.provider || loaded.provider === "none") {
    return { provider: "none", ...DEFAULT_BACKUP_COMMON };
  }

  const scope =
    "scope" in loaded && loaded.scope
      ? loaded.scope === "enterpriseflow"
        ? "wikiflow"
        : loaded.scope
      : DEFAULT_BACKUP_COMMON.scope;
  const common = {
    scope: scope as BackupSettings["scope"],
    includeExtractCache:
      "includeExtractCache" in loaded
        ? Boolean(loaded.includeExtractCache)
        : DEFAULT_BACKUP_COMMON.includeExtractCache,
    excludePatterns:
      "excludePatterns" in loaded && loaded.excludePatterns
        ? loaded.excludePatterns
        : DEFAULT_BACKUP_COMMON.excludePatterns,
    scheduleEnabled:
      "scheduleEnabled" in loaded
        ? Boolean(loaded.scheduleEnabled)
        : DEFAULT_BACKUP_COMMON.scheduleEnabled,
    scheduleIntervalHours:
      "scheduleIntervalHours" in loaded && loaded.scheduleIntervalHours
        ? loaded.scheduleIntervalHours
        : DEFAULT_BACKUP_COMMON.scheduleIntervalHours,
    retentionCount:
      "retentionCount" in loaded && loaded.retentionCount
        ? loaded.retentionCount
        : DEFAULT_BACKUP_COMMON.retentionCount,
  };

  if (loaded.provider === "s3") {
    return {
      provider: "s3",
      ...common,
      endpoint: loaded.endpoint ?? "",
      region: loaded.region ?? "us-east-1",
      bucket: loaded.bucket ?? "",
      prefix: loaded.prefix ?? "wikiflow",
      accessKeyId: loaded.accessKeyId ?? "",
      secretAccessKey: loaded.secretAccessKey ?? "",
      forcePathStyle: loaded.forcePathStyle ?? false,
    };
  }

  return {
    provider: "github",
    ...common,
    owner: loaded.provider === "github" ? loaded.owner ?? "" : "",
    repo: loaded.provider === "github" ? loaded.repo ?? "" : "",
    branch: loaded.provider === "github" ? loaded.branch ?? "main" : "main",
    pathPrefix:
      loaded.provider === "github" ? loaded.pathPrefix ?? "vault-backups" : "vault-backups",
    token: loaded.provider === "github" ? loaded.token ?? "" : "",
  };
}

export function clampSettings(settings: PluginSettings): PluginSettings {
  return {
    ...settings,
    pageGenerationConcurrency: Math.max(
      1,
      Math.min(16, Math.floor(settings.pageGenerationConcurrency) || 1),
    ),
    maxConcurrentWorkflowRuns: Math.max(
      1,
      Math.min(8, Math.floor(settings.maxConcurrentWorkflowRuns) || 1),
    ),
    maxWorkflowNestingDepth: Math.max(
      1,
      Math.min(32, Math.floor(settings.maxWorkflowNestingDepth) || 8),
    ),
    fileAddedDebounceSeconds: Math.max(
      0,
      Math.floor(settings.fileAddedDebounceSeconds) || 0,
    ),
    backup:
      settings.backup.provider === "none"
        ? settings.backup
        : {
            ...settings.backup,
            retentionCount: Math.max(
              1,
              Math.floor(settings.backup.retentionCount) || 10,
            ),
            scheduleIntervalHours: Math.max(
              1,
              Math.floor(settings.backup.scheduleIntervalHours) || 24,
            ),
          },
  };
}

export function mergeSettings(
  loaded: Partial<PluginSettings> | null | undefined,
): PluginSettings {
  const merged: PluginSettings = {
    ...DEFAULT_SETTINGS,
    ...loaded,
    backup: mergeBackupSettings(loaded?.backup),
  };
  return clampSettings(merged);
}
