import { App, Modal, Setting } from "obsidian";
import type { BackupSnapshotInfo } from "@shared/types/backup";
import type { WikiFlowPlugin } from "../main";

export class RestoreBackupModal extends Modal {
  private snapshots: BackupSnapshotInfo[] = [];
  private selectedId = "";
  private previewText = "Run dry-run preview to see changes.";

  constructor(
    app: App,
    private plugin: WikiFlowPlugin,
  ) {
    super(app);
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Restore from remote backup" });

    if (this.plugin.settings.backup.provider === "none") {
      contentEl.createEl("p", {
        text: "Configure a backup provider in WikiFlow settings first.",
      });
      return;
    }

    try {
      this.snapshots = await this.plugin.core.backup.listSnapshots();
    } catch (err) {
      contentEl.createEl("p", {
        text: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    if (this.snapshots.length === 0) {
      contentEl.createEl("p", { text: "No remote snapshots found." });
      return;
    }

    this.selectedId = this.snapshots[0].snapshotId;

    new Setting(contentEl)
      .setName("Snapshot")
      .addDropdown((dropdown) => {
        for (const snap of this.snapshots) {
          dropdown.addOption(
            snap.snapshotId,
            `${snap.snapshotId} (${snap.scope}, ${formatBytes(snap.totalBytes)})`,
          );
        }
        dropdown.setValue(this.selectedId);
        dropdown.onChange((value) => {
          this.selectedId = value;
        });
      });

    const previewEl = contentEl.createDiv({ cls: "wikiflow-restore-preview" });
    previewEl.style.whiteSpace = "pre-wrap";
    previewEl.setText(this.previewText);

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("Dry-run preview (merge)").onClick(() => {
          void this.runPreview("merge", previewEl);
        }),
      )
      .addButton((btn) =>
        btn
          .setButtonText("Restore (merge)")
          .setCta()
          .onClick(() => {
            void this.runRestore("merge", false);
          }),
      )
      .addButton((btn) =>
        btn.setButtonText("Replace (dangerous)").onClick(() => {
          void this.runReplaceFlow(previewEl);
        }),
      );
  }

  private async runPreview(
    mode: "merge" | "replace",
    previewEl: HTMLElement,
  ): Promise<void> {
    try {
      const report = await this.plugin.core.backup.pull({
        snapshotId: this.selectedId,
        mode,
        dryRun: true,
      });
      previewEl.setText(
        `Preview (${mode})\n` +
          `+${report.filesAdded} added, ~${report.filesUpdated} updated, -${report.filesDeleted} deleted`,
      );
    } catch (err) {
      previewEl.setText(err instanceof Error ? err.message : String(err));
    }
  }

  private async runReplaceFlow(previewEl: HTMLElement): Promise<void> {
    const report = await this.plugin.core.backup.pull({
      snapshotId: this.selectedId,
      mode: "replace",
      dryRun: true,
    });

    previewEl.setText(
      `Preview (replace)\n` +
        `+${report.filesAdded} added, ~${report.filesUpdated} updated, -${report.filesDeleted} deleted`,
    );

    const confirmed = window.confirm(
      `Replace mode will delete ${report.filesDeleted} local file(s) in scope. Continue?`,
    );
    if (!confirmed) return;
    await this.runRestore("replace", false);
  }

  private async runRestore(
    mode: "merge" | "replace",
    dryRun: boolean,
  ): Promise<void> {
    const errorEl = this.contentEl.querySelector(
      ".wikiflow-restore-error",
    );
    errorEl?.remove();

    try {
      const report = await this.plugin.core.backup.pull({
        snapshotId: this.selectedId,
        mode,
        dryRun,
      });
      if (!dryRun) {
        this.close();
        void report;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.contentEl.createDiv({ cls: "wikiflow-restore-error" }).setText(msg);
    }
  }
}

export function openRestoreBackupModal(plugin: WikiFlowPlugin): void {
  const modal = new RestoreBackupModal(plugin.app, plugin);
  modal.open();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
