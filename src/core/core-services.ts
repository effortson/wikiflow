import type { BackupService } from "@shared/types/backup";
import type { PluginSettings } from "./config/settings";
import { EnterpriseBackupService } from "./backup/backup-service";
import { ExtractCache } from "./cache/extract-cache";
import { EventBus } from "./events/event-bus";
import { DedupRegistry, JobQueue } from "./jobs/job-queue";
import { LLMService, OpenAICompatibleLLMService } from "./llm/llm-service";
import { Logger } from "./log/logger";
import { VaultAdapter } from "./vault/vault-adapter";
import type { Vault } from "obsidian";

export interface CoreServices {
  llm: LLMService;
  jobs: JobQueue;
  dedup: DedupRegistry;
  vault: VaultAdapter;
  cache: ExtractCache;
  backup: BackupService;
  events: EventBus;
  settings: PluginSettings;
  logger: Logger;
}

export interface CoreServicesContext {
  vault: Vault;
  settings: PluginSettings;
  getSettings: () => PluginSettings;
  pluginVersion: string;
}

export function createCoreServices(ctx: CoreServicesContext): CoreServices {
  const logger = new Logger(ctx.getSettings);
  const vaultAdapter = new VaultAdapter(ctx.vault);
  const events = new EventBus();

  return {
    llm: new OpenAICompatibleLLMService(ctx.getSettings, logger),
    jobs: new JobQueue(),
    dedup: new DedupRegistry(),
    vault: vaultAdapter,
    cache: new ExtractCache(vaultAdapter, ctx.getSettings),
    backup: new EnterpriseBackupService(
      ctx.vault,
      ctx.getSettings,
      events,
      logger,
      ctx.pluginVersion,
    ),
    events,
    settings: ctx.settings,
    logger,
  };
}
