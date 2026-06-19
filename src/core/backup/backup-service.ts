import type {
  BackupPushOptions,
  BackupReport,
  BackupService,
  BackupSettings,
  BackupSnapshotInfo,
  RestoreOptions,
  RestoreReport,
} from "@shared/types/backup";
import type { PluginSettings } from "../config/settings";
import type { EventBus } from "../events/event-bus";
import type { Logger } from "../log/logger";
import type { Vault } from "obsidian";
import {
  buildSnapshot,
  verifySnapshotIntegrity,
} from "./snapshot";
import { applyRestorePlan, planRestore } from "./restore";
import { GitHubBackupProvider } from "./providers/github-provider";
import { S3BackupProvider } from "./providers/s3-provider";
import type { BackupRemoteProvider } from "./providers/types";
import { GITHUB_MAX_ZIP_BYTES } from "./providers/types";

export class EnterpriseBackupService implements BackupService {
  private activeJob: Promise<unknown> | null = null;
  private activeController: AbortController | null = null;

  constructor(
    private vault: Vault,
    private getSettings: () => PluginSettings,
    private events: EventBus,
    private logger: Logger,
    private pluginVersion: string,
  ) {}

  async testConnection(): Promise<void> {
    const provider = this.requireProvider();
    await provider.testConnection();
  }

  async listSnapshots(): Promise<BackupSnapshotInfo[]> {
    const provider = this.requireProvider();
    return provider.listSnapshots();
  }

  async push(options: BackupPushOptions = {}): Promise<BackupReport> {
    return this.runExclusive(
      "push",
      async (signal) => {
        const started = Date.now();
        const settings = this.getSettings();
        const backup = settings.backup;
        if (backup.provider === "none") {
          throw new Error("Backup provider is not configured");
        }

        const provider = this.createProvider(backup);
        const scope = options.scope ?? backup.scope;

        const { snapshotId, manifest, zipBytes } = await buildSnapshot(
          this.vault,
          {
            scope,
            includeExtractCache: backup.includeExtractCache,
            excludePatterns: backup.excludePatterns,
            paths: {
              rawFolder: settings.rawFolder,
              sourceFolder: settings.sourceFolder,
              wikiRoot: settings.wikiRoot,
              schemaRoot: settings.schemaRoot,
              workflowsFolder: settings.workflowsFolder,
            },
            vaultName: "vault",
            pluginVersion: this.pluginVersion,
            signal,
          },
        );

        if (
          backup.provider === "github" &&
          zipBytes.byteLength > GITHUB_MAX_ZIP_BYTES
        ) {
          throw new Error(
            `Snapshot exceeds GitHub size limit (${GITHUB_MAX_ZIP_BYTES} bytes). Use S3 instead.`,
          );
        }

        if (signal.aborted) throw new Error("Backup push cancelled");

        await provider.uploadSnapshot(snapshotId, manifest, zipBytes);
        if (signal.aborted) throw new Error("Backup push cancelled");

        await provider.writeLatestPointer({
          snapshotId,
          createdAt: manifest.createdAt,
          contentHash: manifest.contentHash,
        });

        await this.enforceRetention(provider, backup.retentionCount, signal);

        const report: BackupReport = {
          snapshotId,
          provider: backup.provider,
          status: "completed",
          uploadedBytes: zipBytes.byteLength,
          durationMs: Date.now() - started,
        };
        this.events.publish("backup:done", { report });
        return report;
      },
      options.signal,
    );
  }

  async pull(options: RestoreOptions): Promise<RestoreReport> {
    return this.runExclusive(
      "pull",
      async (signal) => {
        const settings = this.getSettings();
        const backup = settings.backup;
        if (backup.provider === "none") {
          throw new Error("Backup provider is not configured");
        }

        const provider = this.createProvider(backup);
        const pointer = options.snapshotId
          ? { snapshotId: options.snapshotId }
          : await provider.downloadLatestPointer();

        if (!pointer?.snapshotId) {
          throw new Error("No remote snapshot found");
        }

        if (signal.aborted) throw new Error("Restore cancelled");

        const downloaded = await provider.downloadSnapshot(pointer.snapshotId);
        if (signal.aborted) throw new Error("Restore cancelled");

        const parsed = await verifySnapshotIntegrity(downloaded.zipBytes);

        const scopeOptions = {
          scope: parsed.manifest.scope,
          includeExtractCache: parsed.manifest.includeExtractCache,
          excludePatterns: backup.excludePatterns,
          paths: {
            rawFolder: settings.rawFolder,
            sourceFolder: settings.sourceFolder,
            wikiRoot: settings.wikiRoot,
            schemaRoot: settings.schemaRoot,
            workflowsFolder: settings.workflowsFolder,
          },
        };

        const plan = await planRestore(
          this.vault,
          parsed.manifest,
          parsed.files,
          options.mode,
          scopeOptions,
        );

        const report: RestoreReport = {
          snapshotId: pointer.snapshotId,
          provider: backup.provider,
          status: "completed",
          mode: options.mode,
          filesAdded: plan.filesAdded,
          filesUpdated: plan.filesUpdated,
          filesDeleted: plan.filesDeleted,
          dryRun: Boolean(options.dryRun),
          changedPaths: plan.changedPaths,
        };

        if (!options.dryRun) {
          if (signal.aborted) throw new Error("Restore cancelled");
          await applyRestorePlan(this.vault, plan);
          this.events.publish("restore:done", { report });
        }

        return report;
      },
      options.signal,
    );
  }

  cancelActive(): void {
    this.activeController?.abort();
  }

  private async enforceRetention(
    provider: BackupRemoteProvider,
    retentionCount: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const snapshots = await provider.listSnapshots();
    const toDelete = snapshots.slice(retentionCount);
    for (const snap of toDelete) {
      if (signal?.aborted) throw new Error("Backup push cancelled");
      try {
        await provider.deleteSnapshot(snap.snapshotId);
      } catch (err) {
        this.logger.warn("Failed to delete old snapshot", {
          snapshotId: snap.snapshotId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  private createProvider(
    backup: Exclude<BackupSettings, { provider: "none" }>,
  ): BackupRemoteProvider {
    if (backup.provider === "s3") return new S3BackupProvider(backup);
    return new GitHubBackupProvider(backup);
  }

  private requireProvider(): BackupRemoteProvider {
    const backup = this.getSettings().backup;
    if (backup.provider === "none") {
      throw new Error("Backup provider is not configured");
    }
    return this.createProvider(backup);
  }

  private async runExclusive<T>(
    kind: string,
    fn: (signal: AbortSignal) => Promise<T>,
    externalSignal?: AbortSignal,
  ): Promise<T> {
    if (this.activeJob) {
      throw new Error(`Another backup ${kind} is already running`);
    }

    const controller = new AbortController();
    this.activeController = controller;

    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener("abort", onExternalAbort);
      }
    }

    const job = fn(controller.signal).finally(() => {
      if (this.activeJob === job) this.activeJob = null;
      if (this.activeController === controller) this.activeController = null;
      externalSignal?.removeEventListener("abort", onExternalAbort);
    });
    this.activeJob = job;

    try {
      return await job;
    } catch (err) {
      const settings = this.getSettings();
      const message = err instanceof Error ? err.message : String(err);
      const cancelled =
        controller.signal.aborted ||
        externalSignal?.aborted ||
        message.toLowerCase().includes("cancelled");

      if (kind === "push") {
        this.events.publish("backup:failed", {
          report: {
            snapshotId: "",
            provider: settings.backup.provider,
            status: cancelled ? "cancelled" : "failed",
            uploadedBytes: 0,
            durationMs: 0,
            error: message,
          },
        });
      } else {
        this.events.publish("restore:failed", {
          report: {
            snapshotId: "",
            provider: settings.backup.provider,
            status: cancelled ? "cancelled" : "failed",
            mode: "merge",
            filesAdded: 0,
            filesUpdated: 0,
            filesDeleted: 0,
            dryRun: false,
            error: message,
          },
        });
      }
      throw err;
    }
  }
}
