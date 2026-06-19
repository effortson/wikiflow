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

export const WORKFLOW_VIEW_TYPE = "enterpriseflow-workflow";

const WORKFLOW_STYLE_ID = "enterpriseflow-workflow-styles";

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
  private pendingPath: string | null = null;
  private currentPath: string | null = null;

  constructor(leaf: WorkspaceLeaf, private host: WorkflowViewHost) {
    super(leaf);
  }

  getViewType(): string {
    return WORKFLOW_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Workflow";
  }

  getIcon(): string {
    return "git-branch";
  }

  getState(): WorkflowCanvasState {
    return { filePath: this.currentPath ?? undefined };
  }

  async setState(
    state: unknown,
    _result: { history: boolean },
  ): Promise<void> {
    const next = state as WorkflowCanvasState | null | undefined;
    if (next?.filePath) {
      this.queueWorkflowPath(next.filePath);
    }
  }

  loadWorkflow(path: string): void {
    this.queueWorkflowPath(path);
  }

  private queueWorkflowPath(path: string): void {
    this.pendingPath = path;
    this.currentPath = path;
    if (this.root) {
      this.renderEditor();
    }
  }

  async onOpen(): Promise<void> {
    ensureWorkflowStyles();
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("enterpriseflow-workflow-view");
    const mount = container.createDiv({ cls: "enterpriseflow-workflow-mount" });
    mount.style.height = "100%";

    this.root = createRoot(mount);
    this.renderEditor();
  }

  async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
  }

  private renderEditor(): void {
    if (!this.root) return;
    const path = this.pendingPath ?? this.currentPath;
    this.pendingPath = null;
    const deps = createWorkflowEditorDeps(this.host);

    this.root.render(
      <StrictMode>
        <WorkflowEditor deps={deps} initialPath={path ?? undefined} />
      </StrictMode>,
    );
  }
}
