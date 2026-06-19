import type { WorkflowDefinition } from "@shared/types/workflow";
import type { WorkflowStepEvent } from "@shared/types/workflow-step";
import { orderedQueryWorkflowNodeIds } from "../workflow/shared/query-workflow";

export type RunPanelPhase = "pending" | "running" | "completed" | "failed";

export interface RunPanelRow {
  nodeId: string;
  nodeType: string;
  phase: RunPanelPhase;
  error?: string;
  durationMs?: number;
}

export interface QueryWorkflowRunPanelOptions {
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

export class QueryWorkflowRunPanel {
  private rows = new Map<string, RunPanelRow>();
  private listEl: HTMLElement;
  private bodyEl: HTMLElement;
  private toggleBtn: HTMLButtonElement;
  private chevronEl: HTMLElement;
  private collapsed: boolean;
  private onCollapsedChange?: (collapsed: boolean) => void;

  constructor(
    private container: HTMLElement,
    private title: string,
    options: QueryWorkflowRunPanelOptions = {},
  ) {
    this.collapsed = options.collapsed ?? true;
    this.onCollapsedChange = options.onCollapsedChange;

    container.empty();
    container.addClass("wikiflow-query-run-panel");

    const header = container.createDiv({
      cls: "wikiflow-query-run-panel__header",
    });
    this.toggleBtn = header.createEl("button", {
      cls: "wikiflow-query-run-panel__toggle",
      type: "button",
    });
    this.chevronEl = this.toggleBtn.createSpan({
      cls: "wikiflow-query-run-panel__chevron",
      text: "▸",
    });
    this.toggleBtn.createSpan({
      cls: "wikiflow-query-run-panel__title",
      text: title,
    });
    this.toggleBtn.addEventListener("click", () => {
      this.setCollapsed(!this.collapsed);
    });

    this.bodyEl = container.createDiv({ cls: "wikiflow-query-run-panel__body" });
    this.listEl = this.bodyEl.createDiv({
      cls: "wikiflow-query-run-panel__list",
    });

    this.applyCollapsed();
  }

  setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    this.applyCollapsed();
    this.onCollapsedChange?.(collapsed);
  }

  expand(): void {
    this.setCollapsed(false);
  }

  isCollapsed(): boolean {
    return this.collapsed;
  }

  reset(def: WorkflowDefinition): void {
    this.rows.clear();
    this.listEl.empty();

    const nodeById = new Map(def.nodes.map((node) => [node.id, node]));
    for (const nodeId of orderedQueryWorkflowNodeIds(def)) {
      const node = nodeById.get(nodeId);
      if (!node) continue;
      const row: RunPanelRow = {
        nodeId,
        nodeType: node.type,
        phase: "pending",
      };
      this.rows.set(nodeId, row);
      this.listEl.appendChild(this.renderRow(row));
    }
  }

  applyStep(step: WorkflowStepEvent): void {
    const row = this.rows.get(step.nodeId);
    if (!row) return;

    if (step.phase === "started") {
      row.phase = "running";
    } else if (step.phase === "completed") {
      row.phase = "completed";
      row.durationMs = step.durationMs;
      row.error = undefined;
    } else if (step.phase === "failed") {
      row.phase = "failed";
      row.error = step.error;
      row.durationMs = step.durationMs;
    }

    this.refreshRow(row);

    if (step.phase === "started") {
      const el = this.listEl.querySelector(
        `[data-node-id="${cssEscape(row.nodeId)}"]`,
      );
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  private applyCollapsed(): void {
    this.container.toggleClass("is-collapsed", this.collapsed);
    this.chevronEl.setText(this.collapsed ? "▸" : "▾");
    this.toggleBtn.setAttr("aria-expanded", this.collapsed ? "false" : "true");
    if (this.collapsed) {
      this.bodyEl.hide();
    } else {
      this.bodyEl.show();
    }
  }

  private refreshRow(row: RunPanelRow): void {
    const el = this.listEl.querySelector(
      `[data-node-id="${cssEscape(row.nodeId)}"]`,
    );
    if (!el) return;
    const next = this.renderRow(row);
    el.replaceWith(next);
  }

  private renderRow(row: RunPanelRow): HTMLElement {
    const item = document.createElement("div");
    item.className = `wikiflow-query-run-panel__item wikiflow-query-run-panel__item--${row.phase}`;
    item.dataset.nodeId = row.nodeId;

    const status = item.createEl("span", {
      cls: "wikiflow-query-run-panel__status",
    });
    status.setAttr("aria-label", row.phase);

    if (row.phase === "running") {
      status.createSpan({ cls: "wikiflow-query-run-panel__status-dot" });
    } else {
      status.setText(phaseLabel(row.phase));
    }

    item.createEl("span", {
      cls: "wikiflow-query-run-panel__node-id",
      text: row.nodeId,
    });
    item.createEl("span", {
      cls: "wikiflow-query-run-panel__node-type",
      text: row.nodeType,
    });

    if (row.durationMs !== undefined) {
      item.createEl("span", {
        cls: "wikiflow-query-run-panel__duration",
        text: `${row.durationMs}ms`,
      });
    }

    if (row.error) {
      item.createEl("div", {
        cls: "wikiflow-query-run-panel__error",
        text: row.error,
      });
    }

    return item;
  }
}

function phaseLabel(phase: RunPanelPhase): string {
  switch (phase) {
    case "pending":
      return "○";
    case "running":
      return "◉";
    case "completed":
      return "✓";
    case "failed":
      return "✕";
  }
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, "\\$&");
}
