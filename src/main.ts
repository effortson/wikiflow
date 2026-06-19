import { Plugin, TAbstractFile, TFolder, TFile } from "obsidian";
import { createCoreServices, type CoreServices } from "./core/core-services";
import {
  DEFAULT_SETTINGS,
  type PluginSettings,
} from "./core/config/settings";
import { migrateSettings } from "./core/config/migrations";
import { clampSettings } from "./core/config/settings";
import { listWikiInstances, resolveWikiId } from "./wiki/instance-resolver";
import { createWikiService, type WikiService } from "./wiki/wiki-service";
import {
  notifyRawRootViolations,
  scanRawRootViolations,
} from "./wiki/raw-scanner";
import {
  createWorkflowService,
  type EnterpriseWorkflowService,
} from "./workflow/service";
import { TriggerManager } from "./workflow/runtime/trigger-manager";
import {
  WORKFLOW_VIEW_TYPE,
  WorkflowView,
} from "./workflow/ui/workflow-view";
import { WikiFlowSettingTab } from "./ui/settings-tab";
import { openQueryView, QUERY_VIEW_TYPE, QueryView } from "./ui/query-view";
import { openLintModal } from "./ui/lint-modal";
import { openRestoreBackupModal } from "./ui/restore-modal";
import { configurePdfWorker } from "./wiki/extractors/pdf-setup";
import { createTranslator } from "./i18n";
import { IngestProgressIndicator } from "./ui/ingest-progress";
import { showNotice } from "./ui/notice";
import type { WikiInstance } from "@shared/types/wiki-instance";
import type { RestoreReport } from "@shared/types/backup";

export default class WikiFlowPlugin extends Plugin {
  settings: PluginSettings = { ...DEFAULT_SETTINGS };
  core!: CoreServices;
  wiki!: WikiService;
  workflow!: EnterpriseWorkflowService;
  private triggerManager: TriggerManager | null = null;
  private backupScheduleTimer: ReturnType<typeof setInterval> | null = null;
  private lastBackupSummary = "";

  private statusBarItem: HTMLElement | null = null;
  private settingsTab: WikiFlowSettingTab | null = null;
  private ingestProgress: IngestProgressIndicator | null = null;
  private fileDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private unsubscribers: (() => void)[] = [];

  private ui() {
    return createTranslator();
  }

  async onload(): Promise<void> {
    await this.loadSettings();

    configurePdfWorker(
      this.app.vault.adapter.getResourcePath(
        `${this.manifest.dir ?? `.obsidian/plugins/${this.manifest.id}`}/pdf.worker.min.mjs`,
      ),
    );

    const getSettings = () => this.settings;
    this.core = createCoreServices({
      vault: this.app.vault,
      settings: this.settings,
      getSettings,
      pluginVersion: this.manifest.version,
    });

    this.wiki = createWikiService({
      core: this.core,
      getSettings: () => this.settings,
      listWikiInstances: () => this.getWikiInstances(),
      pluginVersion: this.manifest.version,
    });
    this.workflow = createWorkflowService({
      core: this.core,
      wiki: this.wiki,
      getSettings: () => this.settings,
      notice: (message) => showNotice(message),
    });

    this.triggerManager = new TriggerManager({
      core: this.core,
      getSettings: () => this.settings,
      workflow: this.workflow,
      loadWorkflowAtPath: (path) => this.workflow.load(path),
    });
    this.triggerManager.start();

    this.registerVaultFileWatcher();
    this.registerRestoreHandler();
    this.registerWorkflowView();
    this.registerQueryView();

    this.settingsTab = new WikiFlowSettingTab(this.app, this);
    this.addSettingTab(this.settingsTab);
    this.setupStatusBar();
    this.registerIngestProgress();
    this.registerCommands();
    this.registerRibbon();
    this.refreshBackupSchedule();
    this.scanRawFolderOnLoad();

    this.core.logger.info("WikiFlow loaded", {
      version: this.manifest.version,
    });
  }

  onunload(): void {
    this.triggerManager?.stop();
    this.triggerManager = null;
    if (this.backupScheduleTimer) {
      clearInterval(this.backupScheduleTimer);
      this.backupScheduleTimer = null;
    }
    for (const off of this.unsubscribers) off();
    this.unsubscribers = [];
    for (const timer of this.fileDebounceTimers.values()) {
      clearTimeout(timer);
    }
    this.fileDebounceTimers.clear();
    this.ingestProgress?.dispose();
    this.ingestProgress = null;
    this.statusBarItem?.remove();
  }

  async loadSettings(): Promise<void> {
    const loaded = await this.loadData();
    this.settings = migrateSettings(loaded);
  }

  async saveSettings(): Promise<void> {
    Object.assign(this.settings, clampSettings(this.settings));
    await this.saveData(this.settings);
    this.core.settings = this.settings;
  }

  getWikiInstances(): WikiInstance[] {
    const vault = this.app.vault;
    return listWikiInstances({
      rawFolder: this.settings.rawFolder,
      sourceFolder: this.settings.sourceFolder,
      wikiRoot: this.settings.wikiRoot,
      schemaRoot: this.settings.schemaRoot,
      listDirectChildren: (folderPath) => {
        const folder = vault.getAbstractFileByPath(folderPath);
        if (!(folder instanceof TFolder)) return [];
        return folder.children.map((c) => c.path);
      },
      isFolder: (path) => {
        const f = vault.getAbstractFileByPath(path);
        return f instanceof TFolder;
      },
    });
  }

  refreshWikiList(): void {
    this.settingsTab?.refreshWikiDropdown();
  }

  refreshStatusBar(): void {
    if (!this.statusBarItem) return;
    const tr = this.ui();
    const llm = this.settings.llmReady
      ? tr.statusBar("llmReady")
      : tr.statusBar("llmNotConfigured");
    const backup =
      this.lastBackupSummary ||
      (this.settings.backup.provider === "none"
        ? tr.statusBar("backupOff")
        : tr.statusBar("backupProvider", {
            provider: this.settings.backup.provider,
          }));
    this.statusBarItem.setText(`WikiFlow · ${llm} · ${backup}`);
  }

  refreshBackupSchedule(): void {
    if (this.backupScheduleTimer) {
      clearInterval(this.backupScheduleTimer);
      this.backupScheduleTimer = null;
    }

    const backup = this.settings.backup;
    if (backup.provider === "none" || !backup.scheduleEnabled) return;

    const hours = Math.max(1, backup.scheduleIntervalHours);
    const ms = hours * 3_600_000;
    this.backupScheduleTimer = setInterval(() => {
      void this.pushBackup("scheduled");
    }, ms);
  }

  refreshSettingsDisplay(): void {
    this.settingsTab?.display();
  }

  private async pushBackup(source: string): Promise<void> {
    const tr = this.ui();
    try {
      const report = await this.core.backup.push();
      this.lastBackupSummary = tr.statusBar("backupSnapshot", {
        id: report.snapshotId,
      });
      this.refreshStatusBar();
      this.core.logger.info("backup push complete", { source, report });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastBackupSummary = tr.statusBar("backupFailed");
      this.refreshStatusBar();
      this.core.logger.error("backup push failed", { source, error: msg });
    }
  }

  private setupStatusBar(): void {
    this.statusBarItem = this.addStatusBarItem();
    this.refreshStatusBar();
  }

  private registerIngestProgress(): void {
    this.ingestProgress = new IngestProgressIndicator(this);
    this.unsubscribers.push(
      this.core.events.subscribe("ingest:progress", (event) => {
        this.ingestProgress?.handle(event);
      }),
      this.core.events.subscribe("ingest:done", ({ report }) => {
        this.ingestProgress?.handleDone(report);
      }),
    );
  }

  private registerCommands(): void {
    const tr = this.ui();

    this.addCommand({
      id: "extract-raw-active-wiki",
      name: tr.command("extractRawActiveWiki"),
      checkCallback: (checking) => {
        const wikiId = this.settings.activeWikiId;
        if (!wikiId) return false;
        if (!this.getWikiInstances().some((w) => w.wikiId === wikiId)) {
          return false;
        }
        if (!checking) void this.extractActiveWikiRaw(wikiId);
        return true;
      },
    });

    this.addCommand({
      id: "extract-current-raw-file",
      name: tr.command("extractCurrentRawFile"),
      checkCallback: (checking) => {
        const file = this.getActiveRawFile();
        if (!file) return false;
        if (!checking) void this.extractRawFile(file);
        return true;
      },
    });

    this.addCommand({
      id: "ingest-current-file",
      name: tr.command("ingestCurrentFile"),
      checkCallback: (checking) => {
        const file = this.getActiveIngestFile();
        if (!file) return false;
        if (!checking) void this.ingestFile(file);
        return true;
      },
    });

    this.addCommand({
      id: "ingest-active-wiki",
      name: tr.command("ingestActiveWiki"),
      checkCallback: (checking) => {
        const wikiId = this.settings.activeWikiId;
        if (!wikiId) return false;
        if (!this.getWikiInstances().some((w) => w.wikiId === wikiId)) {
          return false;
        }
        if (!checking) void this.ingestActiveWiki(wikiId);
        return true;
      },
    });

    this.addCommand({
      id: "query-active-wiki",
      name: tr.command("queryActiveWiki"),
      checkCallback: (checking) => {
        const wikiId = this.requireActiveWikiId();
        if (!wikiId) return false;
        if (!checking) void openQueryView(this, wikiId);
        return true;
      },
    });

    this.addCommand({
      id: "open-wiki-query",
      name: tr.command("openWikiQuery"),
      callback: () => {
        const wikiId = this.requireActiveWikiId() ?? undefined;
        void openQueryView(this, wikiId);
      },
    });

    this.addCommand({
      id: "lint-active-wiki",
      name: tr.command("lintActiveWiki"),
      checkCallback: (checking) => {
        const wikiId = this.requireActiveWikiId();
        if (!wikiId) return false;
        if (!checking) openLintModal(this, wikiId);
        return true;
      },
    });

    this.addCommand({
      id: "regenerate-index",
      name: tr.command("regenerateIndex"),
      checkCallback: (checking) => {
        const wikiId = this.requireActiveWikiId();
        if (!wikiId) return false;
        if (!checking) void this.regenerateIndex(wikiId);
        return true;
      },
    });

    this.addCommand({
      id: "generate-wiki-schema",
      name: tr.command("generateWikiSchema"),
      checkCallback: (checking) => {
        const wikiId = this.requireActiveWikiId();
        if (!wikiId) return false;
        if (!checking) void this.generateWikiSchema(wikiId);
        return true;
      },
    });

    this.addCommand({
      id: "open-workflow-canvas",
      name: tr.command("openWorkflowCanvas"),
      callback: () => {
        const path = this.getActiveWorkflowPath();
        void this.openWorkflowCanvas(path ?? undefined);
      },
    });

    this.addCommand({
      id: "run-workflow",
      name: tr.command("runWorkflow"),
      checkCallback: (checking) => {
        const path = this.getActiveWorkflowPath();
        if (!path) return false;
        if (!checking) void this.runWorkflowAt(path);
        return true;
      },
    });

    this.addCommand({
      id: "backup-push",
      name: tr.command("backupPush"),
      callback: () => void this.pushBackup("command"),
    });

    this.addCommand({
      id: "backup-restore",
      name: tr.command("backupRestore"),
      callback: () => openRestoreBackupModal(this),
    });

    this.addCommand({
      id: "validate-workflow",
      name: tr.command("validateWorkflow"),
      checkCallback: (checking) => {
        const path = this.getActiveWorkflowPath();
        if (!path) return false;
        if (!checking) void this.validateWorkflowAt(path);
        return true;
      },
    });
  }

  private getActiveWorkflowPath(): string | null {
    const candidates = [
      this.app.workspace.getActiveFile(),
      this.app.workspace.activeEditor?.file ?? null,
    ];
    for (const file of candidates) {
      if (file instanceof TFile && file.path.endsWith(".workflow.json")) {
        return file.path;
      }
    }
    return null;
  }

  private async runWorkflowAt(path: string): Promise<void> {
    const tr = this.ui();
    try {
      const def = await this.workflow.load(path);
      const validation = await this.workflow.validate(def, {
        resolveSubworkflows: true,
      });
      if (!validation.valid) {
        showNotice(
          tr.notice("workflowInvalid", {
            message: validation.errors[0]?.message ?? "unknown",
          }),
          { level: "error" },
        );
        return;
      }

      showNotice(tr.notice("runningWorkflow", { name: def.name }));
      const report = await this.workflow.run(def, {});
      showNotice(
        tr.notice("workflowRunResult", {
          status: report.status,
          name: def.name,
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotice(tr.notice("workflowRunFailed", { message: msg }), {
        level: "error",
      });
    }
  }

  private async validateWorkflowAt(path: string): Promise<void> {
    const tr = this.ui();
    try {
      const def = await this.workflow.load(path);
      const result = await this.workflow.validate(def, {
        resolveSubworkflows: true,
      });
      if (result.valid) {
        showNotice(tr.notice("workflowValid", { name: def.name }));
        return;
      }
      showNotice(
        tr.notice("workflowInvalidWithCount", {
          count: result.errors.length,
          message: result.errors[0]?.message ?? "",
        }),
        { level: "error" },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotice(tr.notice("validationFailed", { message: msg }), {
        level: "error",
      });
    }
  }

  private requireActiveWikiId(): string | null {
    const wikiId = this.settings.activeWikiId;
    if (!wikiId) return null;
    if (!this.getWikiInstances().some((w) => w.wikiId === wikiId)) return null;
    return wikiId;
  }

  private async regenerateIndex(wikiId: string): Promise<void> {
    const tr = this.ui();
    try {
      showNotice(tr.notice("regeneratingIndex", { wikiId }));
      await this.wiki.regenerateIndex(wikiId);
      showNotice(tr.notice("indexRebuilt", { wikiId }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotice(tr.notice("indexRebuildFailed", { message: msg }), {
        level: "error",
      });
    }
  }

  private async generateWikiSchema(wikiId: string): Promise<void> {
    const tr = this.ui();
    try {
      showNotice(tr.notice("generatingSchema", { wikiId }));
      const result = await this.wiki.generateSchema(wikiId);
      showNotice(
        result.mode === "default"
          ? tr.notice("schemaGeneratedDefault", { path: result.path })
          : tr.notice("schemaGeneratedFromSource", {
              path: result.path,
              count: result.sourceFileCount,
            }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotice(tr.notice("schemaGenerateFailed", { message: msg }), {
        level: "error",
      });
    }
  }

  private scanRawFolderOnLoad(): void {
    const violations = scanRawRootViolations(
      this.app.vault,
      this.settings.rawFolder,
    );
    notifyRawRootViolations(violations, this.core.logger);
  }

  private async extractActiveWikiRaw(wikiId: string): Promise<void> {
    const tr = this.ui();
    try {
      showNotice(tr.notice("extractingRawWiki", { wikiId }));
      const result = await this.wiki.extractRawToSource(wikiId);
      if (result.errors.length) {
        showNotice(
          tr.notice("extractRawFailed", {
            message: result.errors[0]?.message ?? "unknown",
          }),
          { level: "error" },
        );
        return;
      }
      showNotice(
        tr.notice("extractRawComplete", {
          converted: result.converted.length,
          skipped: result.skipped.length,
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotice(tr.notice("extractRawError", { message: msg }), {
        level: "error",
      });
    }
  }

  private async extractRawFile(file: TFile): Promise<void> {
    const tr = this.ui();
    try {
      showNotice(tr.notice("extractingRawFile", { name: file.basename }));
      const result = await this.wiki.extractRawFile(file);
      showNotice(
        tr.notice("extractRawComplete", {
          converted: result.converted.length,
          skipped: result.skipped.length,
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotice(tr.notice("extractRawError", { message: msg }), {
        level: "error",
      });
    }
  }

  private async ingestActiveWiki(wikiId: string): Promise<void> {
    const tr = this.ui();
    if (!this.settings.llmReady) {
      showNotice(tr.notice("llmNotConfigured"), { level: "warn" });
      return;
    }
    try {
      const report = await this.wiki.ingestWiki(wikiId);
      if (report.status === "failed") {
        showNotice(
          tr.notice("wikiIngestFailed", {
            message: report.errors[0]?.message ?? "unknown",
          }),
          { level: "error" },
        );
        return;
      }
      showNotice(
        tr.notice("wikiIngestResult", {
          status: report.status,
          created: report.createdPages.length,
          updated: report.updatedPages.length,
          skipped: report.skippedPages.length,
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotice(tr.notice("wikiIngestError", { message: msg }), {
        level: "error",
      });
    }
  }

  private getActiveSourceFile(): TFile | null {
    const file = this.app.workspace.getActiveFile();
    if (!(file instanceof TFile)) return null;
    if (!resolveWikiId(file.path, this.settings.sourceFolder)) return null;
    if (file.extension.toLowerCase() !== "md") return null;
    return file;
  }

  private getActiveRawFile(): TFile | null {
    const file = this.app.workspace.getActiveFile();
    if (!(file instanceof TFile)) return null;
    if (!resolveWikiId(file.path, this.settings.rawFolder)) return null;
    return file;
  }

  private getActiveIngestFile(): TFile | null {
    return this.getActiveSourceFile();
  }

  private async ingestFile(file: TFile): Promise<void> {
    const tr = this.ui();
    if (!this.settings.llmReady) {
      showNotice(tr.notice("llmNotConfigured"), { level: "warn" });
      return;
    }

    const wikiId = resolveWikiId(file.path, this.settings.sourceFolder);
    if (!wikiId) {
      showNotice(tr.notice("fileMustBeUnderSource"), { level: "warn" });
      return;
    }

    try {
      const report = await this.wiki.ingestFile(file, { wikiId });
      if (report.status === "failed") {
        showNotice(
          tr.notice("ingestFailed", {
            message: report.errors[0]?.message ?? "unknown",
          }),
          { level: "error" },
        );
        return;
      }
      showNotice(
        tr.notice("ingestComplete", {
          created: report.createdPages.length,
          updated: report.updatedPages.length,
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotice(tr.notice("ingestError", { message: msg }), {
        level: "error",
        data: { path: file.path },
      });
      this.core.logger.error("ingest failed", { error: msg, path: file.path });
    }
  }

  private registerVaultFileWatcher(): void {
    const handler = (file: TAbstractFile) => {
      if (file instanceof TFolder) return;

      const wikiId = resolveWikiId(file.path, this.settings.rawFolder);
      if (!wikiId) {
        this.core.logger.debug("file:added skipped (no wikiId)", {
          path: file.path,
        });
        return;
      }

      const existing = this.fileDebounceTimers.get(file.path);
      if (existing) clearTimeout(existing);

      const ms = Math.max(0, this.settings.fileAddedDebounceSeconds) * 1000;
      const timer = setTimeout(() => {
        this.fileDebounceTimers.delete(file.path);
        this.core.logger.debug("file:added", { path: file.path, wikiId });
        this.core.events.publish("file:added", {
          path: file.path,
          wikiId,
        });
      }, ms);

      this.fileDebounceTimers.set(file.path, timer);
    };

    this.registerEvent(this.app.vault.on("create", handler));
  }

  private registerQueryView(): void {
    this.registerView(
      QUERY_VIEW_TYPE,
      (leaf) => new QueryView(leaf, this),
    );
  }

  private registerWorkflowView(): void {
    this.registerView(
      WORKFLOW_VIEW_TYPE,
      (leaf) =>
        new WorkflowView(leaf, {
          settings: this.settings,
          core: this.core,
          workflow: this.workflow,
          app: this.app,
          getWikiInstances: () => this.getWikiInstances(),
        }),
    );
  }

  private registerRibbon(): void {
    const tr = this.ui();
    this.addRibbonIcon("search", tr.ribbon("openQueryView"), () => {
      const wikiId = this.requireActiveWikiId() ?? undefined;
      void openQueryView(this, wikiId);
    });
    this.addRibbonIcon("git-branch", tr.ribbon("openWorkflowCanvas"), () => {
      const path = this.getActiveWorkflowPath();
      void this.openWorkflowCanvas(path ?? undefined);
    });
  }

  async openWorkflowCanvas(filePath?: string): Promise<void> {
    const leaf =
      this.app.workspace.getLeavesOfType(WORKFLOW_VIEW_TYPE)[0] ??
      this.app.workspace.getLeaf("tab");
    await leaf.setViewState({
      type: WORKFLOW_VIEW_TYPE,
      active: true,
      state: filePath ? { filePath } : {},
    });
    const view = leaf.view;
    if (view instanceof WorkflowView && filePath) {
      view.loadWorkflow(filePath);
    }
  }

  private registerRestoreHandler(): void {
    const offDone = this.core.events.subscribe("backup:done", (payload) => {
      this.lastBackupSummary = this.ui().statusBar("backupSnapshot", {
        id: payload.report.snapshotId,
      });
      this.refreshStatusBar();
    });
    this.unsubscribers.push(offDone);

    const off = this.core.events.subscribe("restore:done", (payload) => {
      this.onRestoreDone(payload.report);
    });
    this.unsubscribers.push(off);
  }

  private onRestoreDone(report: RestoreReport): void {
    const wikiIds = this.inferWikiIdsFromRestore(report);
    if (wikiIds.size === 0) return;

    const names = [...wikiIds].join(", ");
    showNotice(this.ui().notice("restoreCompleteRegenerate", { names }), {
      timeout: 8000,
    });
    this.core.logger.info("restore:done — suggest regenerateIndex", {
      wikiIds: [...wikiIds],
      snapshotId: report.snapshotId,
    });
  }

  private inferWikiIdsFromRestore(report: RestoreReport): Set<string> {
    const ids = new Set<string>();
    const paths = report.changedPaths ?? [];

    if (paths.length > 0) {
      const prefix = `${this.settings.wikiRoot}/`;
      for (const path of paths) {
        if (!path.startsWith(prefix)) continue;
        const wikiId = path.slice(prefix.length).split("/")[0];
        if (wikiId) ids.add(wikiId);
      }
      return ids;
    }

    if (report.filesAdded > 0 || report.filesUpdated > 0) {
      for (const w of this.getWikiInstances()) {
        ids.add(w.wikiId);
      }
    }
    return ids;
  }
}

export { WikiFlowPlugin };
