import { ItemView, WorkspaceLeaf, type App } from "obsidian";
import { createRoot, type Root } from "react-dom/client";
import { StrictMode } from "react";
import type { CoreServices } from "../../core/core-services";
import type { PluginSettings } from "../../core/config/settings";
import type { WikiInstance } from "@shared/types/wiki-instance";
import type { EnterpriseWorkflowService } from "../workflow-service";
import { WorkflowEditor } from "./WorkflowEditor";
import { createWorkflowEditorDeps } from "./create-workflow-editor-deps";
import reactFlowStyles from "@xyflow/react/dist/style.css";
import localStyles from "./workflow-canvas.css";

export const WORKFLOW_VIEW_TYPE = "wikiflow-workflow";

const WORKFLOW_STYLE_ID = "wikiflow-workflow-styles";

function ensureWorkflowStyles(): void {
  document.getElementById(WORKFLOW_STYLE_ID)?.remove();
  const el = document.createElement("style");
  el.id = WORKFLOW_STYLE_ID;
  el.textContent = [reactFlowStyles, localStyles].join("\n");
  document.head.appendChild(el);
}

export interface WorkflowViewHost {
  settings: PluginSettings;
  core: CoreServices;
  workflow: EnterpriseWorkflowService;
  app: App;
  getWikiInstances(): WikiInstance[];
}

export interface WorkflowCanvasState extends Record<string, unknown> {
  filePath?: string;
}

export class WorkflowView extends ItemView {
  private root: Root | null = null;
  private activePath: string | null = null;
  private editorDeps: ReturnType<typeof createWorkflowEditorDeps> | null = null;
  private workflowTitle = "Workflow";

  constructor(leaf: WorkspaceLeaf, private host: WorkflowViewHost) {
    super(leaf);
  }

  getViewType(): string {
    return WORKFLOW_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.workflowTitle;
  }

  getIcon(): string {
    return "git-branch";
  }

  getState(): WorkflowCanvasState {
    return { filePath: this.activePath ?? undefined };
  }

  async setState(
    state: unknown,
    _result: { history: boolean },
  ): Promise<void> {
    const next = state as WorkflowCanvasState | null | undefined;
    if (next?.filePath) {
      this.setActivePath(next.filePath);
    }
  }

  loadWorkflow(path: string): void {
    this.setActivePath(path);
  }

  private setActivePath(path: string): void {
    this.activePath = path;
    if (this.root) {
      this.renderEditor();
    }
  }

  async onOpen(): Promise<void> {
    ensureWorkflowStyles();
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("wikiflow-workflow-view");
    const mount = container.createDiv({ cls: "wikiflow-workflow-mount" });
    mount.style.height = "100%";

    this.editorDeps = createWorkflowEditorDeps(this.host, {
      onMetaChange: (meta) => {
        this.workflowTitle = meta.name.trim() || "Workflow";
        this.updateTabTitle();
      },
    });
    this.root = createRoot(mount);
    this.renderEditor();
  }

  async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
  }

  private renderEditor(): void {
    if (!this.root || !this.editorDeps) return;

    this.root.render(
      <StrictMode>
        <WorkflowEditor
          deps={this.editorDeps}
          activePath={this.activePath ?? undefined}
        />
      </StrictMode>,
    );
  }

  private updateTabTitle(): void {
    const title = this.getDisplayText();
    const header = this.containerEl
      .closest(".workspace-leaf")
      ?.querySelector(".view-header-title");
    if (header) header.setText(title);
  }
}
