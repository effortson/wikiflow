import { Notice } from "obsidian";
import type { IngestReport } from "@shared/types/ingest-report";
import type { IngestProgressEvent } from "@shared/types/ingest-progress";
import { createTranslator } from "../i18n";
import { logNotice } from "./notice";
import { basenameFromPath } from "../wiki/ingest-progress-publisher";

export interface IngestProgressHost {
  addStatusBarItem(): HTMLElement;
  refreshStatusBar(): void;
}

export function formatIngestProgress(
  event: IngestProgressEvent,
  langCode?: string,
): string {
  const tr = createTranslator(langCode);

  if (event.message) return event.message;

  if (event.phase === "wiki_preparing") {
    return tr.progress("wikiPreparing", {
      wikiId: event.wikiId,
      total: event.fileTotal ?? 0,
    });
  }

  const step = tr.progressStep(event.phase);
  const file =
    event.fileName ??
    (event.sourceId ? basenameFromPath(event.sourceId) : event.wikiId);

  if (event.fileTotal && event.fileTotal > 1 && event.fileIndex) {
    return tr.progress("ingestWiki", {
      current: event.fileIndex,
      total: event.fileTotal,
      step,
      file,
    });
  }

  return tr.progress("ingestFile", { step, file });
}

export class IngestProgressIndicator {
  private notice: Notice | null = null;
  private statusItem: HTMLElement | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private wikiBatchTotal = 0;

  constructor(private host: IngestProgressHost) {}

  handle(event: IngestProgressEvent): void {
    if (event.phase === "wiki_preparing" && event.fileTotal) {
      this.wikiBatchTotal = event.fileTotal;
    }

    if (event.fileTotal && event.fileTotal > 1) {
      this.wikiBatchTotal = event.fileTotal;
    }

    if (event.phase === "complete" || event.phase === "failed") {
      this.show(
        formatIngestProgress(event),
        false,
        event.phase === "failed" ? "error" : "info",
      );
      this.scheduleHide(event.phase === "complete" ? 2500 : 4000);
      return;
    }

    this.show(formatIngestProgress(event), true);
  }

  handleDone(report: IngestReport): void {
    if (report.sourceId && this.wikiBatchTotal > 1) {
      return;
    }

    const tr = createTranslator();
    const phase = report.status === "failed" ? "failed" : "complete";
    this.show(
      tr.progressStep(phase),
      false,
      report.status === "failed" ? "error" : "info",
    );
    this.scheduleHide(report.status === "failed" ? 5000 : 2500);
    this.wikiBatchTotal = 0;
  }

  dispose(): void {
    this.clearHideTimer();
    this.notice?.hide();
    this.notice = null;
    this.statusItem?.remove();
    this.statusItem = null;
  }

  private show(detail: string, active: boolean, level: "info" | "error" = "info"): void {
    this.clearHideTimer();

    logNotice(detail, level);

    const tr = createTranslator();
    const statusText = tr.statusBar("ingestActive", { detail });

    if (!this.notice) {
      this.notice = new Notice(detail, 0);
      this.notice.noticeEl.addClass("enterpriseflow-ingest-notice");
    } else {
      this.notice.setMessage(detail);
    }

    if (active) {
      this.notice.noticeEl.addClass("enterpriseflow-ingest-notice--active");
    } else {
      this.notice.noticeEl.removeClass("enterpriseflow-ingest-notice--active");
    }

    if (!this.statusItem) {
      this.statusItem = this.host.addStatusBarItem();
      this.statusItem.addClass("enterpriseflow-ingest-status");
    }
    this.statusItem.setText(statusText);
  }

  private scheduleHide(ms: number): void {
    this.clearHideTimer();
    this.hideTimer = setTimeout(() => this.hide(), ms);
  }

  private hide(): void {
    this.clearHideTimer();
    this.notice?.hide();
    this.notice = null;
    this.statusItem?.remove();
    this.statusItem = null;
    this.wikiBatchTotal = 0;
    this.host.refreshStatusBar();
  }

  private clearHideTimer(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }
}
