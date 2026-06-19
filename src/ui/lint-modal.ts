import type { WikiFlowPlugin } from "../main";
import type { WikiId } from "@shared/types/wiki-instance";
import type { LintReport } from "@shared/types/wiki";
import { App, Modal, Setting } from "obsidian";

export class LintModal extends Modal {
  constructor(
    app: App,
    private plugin: WikiFlowPlugin,
    private wikiId: WikiId,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: `Lint Wiki: ${this.wikiId}` });
    const status = contentEl.createDiv();
    status.setText("Running lint…");

    void this.runLint(status);
  }

  private async runLint(statusEl: HTMLElement): Promise<void> {
    try {
      const report = await this.plugin.wiki.lint(this.wikiId);
      this.renderReport(statusEl, report);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      statusEl.setText(`Lint failed: ${msg}`);
    }
  }

  private renderReport(container: HTMLElement, report: LintReport): void {
    container.empty();
    container.createEl("p", {
      text: `Scanned ${report.stats.pagesScanned} pages, ${report.stats.rawFilesScanned} raw files.`,
    });
    container.createEl("p", {
      text: `Errors: ${report.stats.bySeverity.error} · Warnings: ${report.stats.bySeverity.warning} · Info: ${report.stats.bySeverity.info}`,
    });

    if (!report.issues.length) {
      container.createEl("p", { text: "No issues found." });
      return;
    }

    const list = container.createEl("ul");
    for (const issue of report.issues) {
      const li = list.createEl("li");
      li.createEl("strong", { text: `${issue.severity} · ${issue.code}` });
      li.createEl("span", { text: ` — ${issue.message}` });
      if (issue.pagePath) {
        li.createEl("div", {
          text: issue.pagePath,
          cls: "wikiflow-lint-path",
        });
      }
    }

    new Setting(container).addButton((btn) =>
      btn.setButtonText("Close").onClick(() => this.close()),
    );

    new Setting(container).addButton((btn) =>
      btn.setButtonText("Append summary to log.md").onClick(() => {
        void this.appendLogSummary(report);
      }),
    );
  }

  private async appendLogSummary(report: LintReport): Promise<void> {
    const wiki = this.plugin
      .getWikiInstances()
      .find((w) => w.wikiId === this.wikiId);
    if (!wiki) return;

    const logPath = `${wiki.wikiRoot}/log.md`;
    const line = `- ${report.finishedAt} **lint** errors=${report.stats.bySeverity.error} warnings=${report.stats.bySeverity.warning}\n`;
    const vault = this.plugin.core.vault;
    if (await vault.exists(logPath)) {
      const existing = await vault.readText(logPath);
      await vault.writeText(logPath, `${existing.trimEnd()}\n${line}`);
    }
  }
}

export function openLintModal(
  plugin: WikiFlowPlugin,
  wikiId: WikiId,
): void {
  new LintModal(plugin.app, plugin, wikiId).open();
}
