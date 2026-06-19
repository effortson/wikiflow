import type { WikiId } from "@shared/types/wiki-instance";
import type { RunReport, WorkflowDefinition } from "@shared/types/workflow";
import {
  Component,
  ItemView,
  MarkdownRenderer,
  Setting,
  WorkspaceLeaf,
} from "obsidian";
import { createTranslator } from "../i18n";
import type { WikiFlowPlugin } from "../main";
import { sanitizeLlmMarkdown } from "@shared/sanitize-markdown";
import { stripLlmNoise } from "@shared/strip-llm-noise";
import { resolveWorkflowRunInputs } from "../workflow/ui/run-inputs";
import {
  extractQueryWorkflowAnswer,
  validateQueryWorkflow,
} from "../workflow/shared/query-workflow";
import { QueryWorkflowRunPanel } from "./query-workflow-run-panel";
import { QueryPromptSection } from "./query-prompt-section";
import {
  DEFAULT_QUERY_SYSTEM_PROMPT,
  DEFAULT_QUERY_USER_PROMPT,
  effectiveQuerySystemPrompt,
  effectiveQueryUserPrompt,
} from "../wiki/query-prompts";
import styles from "./query-view.css";

export const QUERY_VIEW_TYPE = "wikiflow-query";

type QueryMode = "wiki" | "workflow";

let stylesInjected = false;

function ensureQueryStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const el = document.createElement("style");
  el.textContent = styles;
  document.head.appendChild(el);
}

export class QueryView extends ItemView {
  private wikiId: WikiId | null = null;
  private queryMode: QueryMode = "wiki";
  private workflowPath: string | null = null;
  private questionInput: HTMLTextAreaElement | null = null;
  private statusEl: HTMLElement | null = null;
  private answerEl: HTMLElement | null = null;
  private citationsEl: HTMLElement | null = null;
  private runPanelHost: HTMLElement | null = null;
  private runPanel: QueryWorkflowRunPanel | null = null;
  private runPanelCollapsed = true;
  private systemPromptSection: QueryPromptSection | null = null;
  private userPromptSection: QueryPromptSection | null = null;
  private systemPromptCollapsed = true;
  private userPromptCollapsed = true;
  private elapsedEl: HTMLElement | null = null;
  private elapsedTimer: ReturnType<typeof setInterval> | null = null;
  private runStartedAt = 0;
  private markdownComponent = new Component();
  private running = false;
  private workflowUnsubs: (() => void)[] = [];

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: WikiFlowPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return QUERY_VIEW_TYPE;
  }

  getDisplayText(): string {
    return createTranslator().queryView("title");
  }

  getIcon(): string {
    return "search";
  }

  setWikiId(wikiId: WikiId): void {
    this.wikiId = wikiId;
    if (this.containerEl.isConnected) {
      this.render();
    }
  }

  refreshLayout(): void {
    if (!this.containerEl.isConnected || this.running) return;
    this.render();
  }

  async onOpen(): Promise<void> {
    ensureQueryStyles();
    if (!this.wikiId) {
      this.wikiId = this.defaultWikiId();
    }
    this.render();
  }

  async onClose(): Promise<void> {
    this.clearWorkflowSubscriptions();
    this.stopElapsedTimer(false);
    this.markdownComponent.unload();
    this.questionInput = null;
    this.statusEl = null;
    this.answerEl = null;
    this.citationsEl = null;
    this.elapsedEl = null;
    this.systemPromptSection = null;
    this.userPromptSection = null;
    this.runPanelHost = null;
    this.runPanel = null;
  }

  private defaultWikiId(): WikiId | null {
    const active = this.plugin.settings.activeWikiId;
    const wikis = this.plugin.getWikiInstances();
    if (active && wikis.some((w) => w.wikiId === active)) return active;
    return wikis[0]?.wikiId ?? null;
  }

  private listWorkflowFiles(): string[] {
    return this.app.vault
      .getFiles()
      .filter((file) => file.path.endsWith(".workflow.json"))
      .map((file) => file.path)
      .sort();
  }

  private render(): void {
    const tr = createTranslator();
    const qv = tr.queryViewMessages();
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("wikiflow-query-view");

    const wikis = this.plugin.getWikiInstances();
    if (!wikis.length) {
      container.createEl("p", { text: qv.noWiki });
      return;
    }

    if (!this.wikiId || !wikis.some((w) => w.wikiId === this.wikiId)) {
      this.wikiId = wikis[0].wikiId;
    }

    const toolbar = container.createDiv({ cls: "wikiflow-query-toolbar" });
    const row = toolbar.createDiv({ cls: "wikiflow-query-toolbar__row" });

    new Setting(row)
      .setName(qv.mode)
      .addDropdown((dropdown) => {
        dropdown.addOption("wiki", qv.modeWiki);
        dropdown.addOption("workflow", qv.modeWorkflow);
        dropdown.setValue(this.queryMode);
        dropdown.onChange((value) => {
          this.queryMode = value as QueryMode;
          this.render();
        });
      });

    new Setting(row)
      .setName(qv.wiki)
      .addDropdown((dropdown) => {
        for (const wiki of wikis) {
          dropdown.addOption(wiki.wikiId, wiki.wikiId);
        }
        dropdown.setValue(this.wikiId!);
        dropdown.onChange((value) => {
          this.wikiId = value;
        });
      });

    const workflowFiles = this.listWorkflowFiles();
    const workflowSetting = new Setting(row).setName(qv.workflow);

    if (this.queryMode === "workflow") {
      if (!workflowFiles.length) {
        workflowSetting.setDesc(qv.noWorkflow);
      } else {
        workflowSetting.addDropdown((dropdown) => {
          for (const path of workflowFiles) {
            dropdown.addOption(path, path);
          }
          if (!this.workflowPath || !workflowFiles.includes(this.workflowPath)) {
            this.workflowPath = workflowFiles[0];
          }
          dropdown.setValue(this.workflowPath!);
          dropdown.onChange((value) => {
            this.workflowPath = value;
          });
        });
      }
      toolbar.createDiv({
        cls: "wikiflow-query-toolbar__hint",
        text: `${qv.wikiDescWorkflow} · ${qv.workflowDesc}`,
      });
    } else {
      workflowSetting.addDropdown((dropdown) => {
        dropdown.addOption("", "—");
        dropdown.setValue("");
        dropdown.setDisabled(true);
      });
      toolbar.createDiv({
        cls: "wikiflow-query-toolbar__hint",
        text: qv.wikiDesc,
      });
    }

    const promptsHost = this.plugin.settings.showQueryPrompts
      ? container.createDiv({
          cls: "wikiflow-query-prompts",
        })
      : null;
    if (promptsHost) {
    const commitPrompt = async (
      key: "querySystemPrompt" | "queryUserPrompt",
      value: string,
    ) => {
      this.plugin.settings[key] = value;
      await this.plugin.saveSettings();
    };

    this.systemPromptSection = new QueryPromptSection(
      promptsHost.createDiv(),
      {
        title: qv.systemPrompt,
        hint: qv.promptVarsHint,
        value: effectiveQuerySystemPrompt(
          this.plugin.settings.querySystemPrompt,
        ),
        defaultValue: DEFAULT_QUERY_SYSTEM_PROMPT,
        resetLabel: qv.resetPrompt,
        rows: 5,
        collapsed: this.systemPromptCollapsed,
        onCollapsedChange: (collapsed) => {
          this.systemPromptCollapsed = collapsed;
        },
        onValueCommit: (value) => void commitPrompt("querySystemPrompt", value),
      },
    );

    this.userPromptSection = new QueryPromptSection(
      promptsHost.createDiv(),
      {
        title: qv.userPrompt,
        hint: qv.promptVarsHint,
        value: effectiveQueryUserPrompt(this.plugin.settings.queryUserPrompt),
        defaultValue: DEFAULT_QUERY_USER_PROMPT,
        resetLabel: qv.resetPrompt,
        rows: 6,
        collapsed: this.userPromptCollapsed,
        onCollapsedChange: (collapsed) => {
          this.userPromptCollapsed = collapsed;
        },
        onValueCommit: (value) => void commitPrompt("queryUserPrompt", value),
      },
    );
    } else {
      this.systemPromptSection = null;
      this.userPromptSection = null;
    }

    this.questionInput = container.createEl("textarea", {
      cls: "wikiflow-query-question",
      attr: {
        placeholder:
          this.queryMode === "workflow"
            ? qv.questionPlaceholderWorkflow
            : qv.questionPlaceholder,
      },
    });
    this.questionInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void this.runQuery();
      }
    });

    const actions = container.createDiv({ cls: "wikiflow-query-actions" });
    const askBtn = actions.createEl("button", {
      cls: "mod-cta",
      text: qv.ask,
    });
    askBtn.addEventListener("click", () => void this.runQuery());

    const clearBtn = actions.createEl("button", { text: qv.clear });
    clearBtn.addEventListener("click", () => this.clearAnswer());

    this.elapsedEl = actions.createDiv({ cls: "wikiflow-query-elapsed" });
    this.elapsedEl.hide();

    this.statusEl = container.createDiv({ cls: "wikiflow-query-status" });
    this.statusEl.setText(qv.hint);

    const body = container.createDiv({ cls: "wikiflow-query-body" });
    this.answerEl = body.createDiv({ cls: "wikiflow-query-answer" });
    this.answerEl.setText(qv.emptyAnswer);
    this.citationsEl = body.createDiv({ cls: "wikiflow-query-citations" });
    this.citationsEl.hide();

    if (this.queryMode === "workflow") {
      this.runPanelHost = container.createDiv({
        cls: "wikiflow-query-run-host",
      });
      this.runPanel = this.createRunPanel(this.runPanelHost, qv.workflowRunTitle);
      this.runPanelHost.hide();
    } else {
      this.runPanelHost = null;
      this.runPanel = null;
    }
  }

  private clearAnswer(): void {
    const tr = createTranslator();
    const qv = tr.queryViewMessages();
    if (this.questionInput) this.questionInput.value = "";
    if (this.statusEl) this.statusEl.setText(qv.hint);
    if (this.answerEl) {
      this.markdownComponent.unload();
      this.markdownComponent = new Component();
      this.answerEl.empty();
      this.answerEl.setText(qv.emptyAnswer);
    }
    if (this.citationsEl) {
      this.citationsEl.empty();
      this.citationsEl.hide();
    }
    this.clearElapsedDisplay();
    if (this.runPanelHost) {
      this.runPanelHost.empty();
      this.runPanelHost.hide();
      this.runPanel = this.createRunPanel(
        this.runPanelHost,
        qv.workflowRunTitle,
      );
    }
    this.clearWorkflowSubscriptions();
  }

  private createRunPanel(
    host: HTMLElement,
    title: string,
  ): QueryWorkflowRunPanel {
    return new QueryWorkflowRunPanel(host, title, {
      collapsed: this.runPanelCollapsed,
      onCollapsedChange: (collapsed) => {
        this.runPanelCollapsed = collapsed;
      },
    });
  }

  private clearWorkflowSubscriptions(): void {
    for (const off of this.workflowUnsubs) off();
    this.workflowUnsubs = [];
  }

  private startElapsedTimer(): void {
    this.stopElapsedTimer(false);
    this.runStartedAt = Date.now();
    if (!this.elapsedEl) return;
    this.elapsedEl.show();
    this.elapsedEl.addClass("is-running");
    this.updateElapsedDisplay(false);
    this.elapsedTimer = setInterval(() => this.updateElapsedDisplay(false), 200);
  }

  private stopElapsedTimer(showFinal: boolean): void {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
    if (!this.elapsedEl) return;
    this.elapsedEl.removeClass("is-running");
    if (showFinal && this.runStartedAt > 0) {
      this.updateElapsedDisplay(true);
    }
  }

  private clearElapsedDisplay(): void {
    this.stopElapsedTimer(false);
    this.runStartedAt = 0;
    if (this.elapsedEl) {
      this.elapsedEl.hide();
      this.elapsedEl.empty();
    }
  }

  private updateElapsedDisplay(final: boolean): void {
    if (!this.elapsedEl || !this.runStartedAt) return;
    const elapsed = (Date.now() - this.runStartedAt) / 1000;
    const seconds = final ? formatElapsedSeconds(elapsed) : String(Math.floor(elapsed));
    this.elapsedEl.setText(
      createTranslator().queryView("elapsedSeconds", { seconds }),
    );
  }

  private async runQuery(): Promise<void> {
    if (this.queryMode === "workflow") {
      await this.runWorkflowQuery();
      return;
    }
    await this.runWikiQuery();
  }

  private async runWikiQuery(): Promise<void> {
    const tr = createTranslator();
    const qv = tr.queryViewMessages();
    const question = this.questionInput?.value.trim() ?? "";
    if (!question || this.running || !this.wikiId) return;

    if (!this.plugin.settings.llmReady) {
      if (this.statusEl) this.statusEl.setText(qv.llmNotConfigured);
      return;
    }

    this.running = true;
    this.startElapsedTimer();
    if (this.statusEl) this.statusEl.setText(qv.thinking);
    if (this.answerEl) {
      this.markdownComponent.unload();
      this.markdownComponent = new Component();
      this.answerEl.empty();
      this.answerEl.setText("…");
    }
    if (this.citationsEl) {
      this.citationsEl.empty();
      this.citationsEl.hide();
    }

    let answer = "";
    let citedPaths: string[] = [];

    try {
      for await (const chunk of this.plugin.wiki.query(this.wikiId, question, {
        systemPrompt: this.systemPromptSection?.getValue(),
        userPrompt: this.userPromptSection?.getValue(),
      })) {
        if (chunk.kind === "text") {
          answer += chunk.delta;
          await this.renderAnswer(answer);
        } else if (chunk.kind === "done") {
          answer = chunk.answer;
          citedPaths = chunk.citedPaths;
          await this.renderAnswer(answer);
        } else if (chunk.kind === "error") {
          if (this.answerEl) this.answerEl.setText(chunk.message);
          if (this.statusEl) this.statusEl.setText(chunk.message);
          return;
        }
      }

      this.renderCitations(citedPaths);
      if (this.statusEl) this.statusEl.setText("");
      await this.renderAnswer(answer, true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (this.answerEl) this.answerEl.setText(msg);
      if (this.statusEl) this.statusEl.setText(msg);
    } finally {
      this.running = false;
      this.stopElapsedTimer(true);
    }
  }

  private async runWorkflowQuery(): Promise<void> {
    const tr = createTranslator();
    const qv = tr.queryViewMessages();
    const question = this.questionInput?.value.trim() ?? "";
    if (!question || this.running || !this.wikiId) return;

    const workflowPath = this.workflowPath;
    if (!workflowPath) {
      if (this.statusEl) this.statusEl.setText(qv.noWorkflow);
      return;
    }

    let def: WorkflowDefinition;
    try {
      def = await this.plugin.workflow.load(workflowPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (this.statusEl) this.statusEl.setText(msg);
      return;
    }

    const shapeCheck = validateQueryWorkflow(def);
    if (!shapeCheck.valid) {
      const msg = tr.queryView("workflowInvalid", { error: shapeCheck.error });
      if (this.statusEl) this.statusEl.setText(msg);
      if (this.answerEl) this.answerEl.setText(msg);
      return;
    }

    const wikiIds = this.plugin.getWikiInstances().map((w) => w.wikiId);
    const resolved = resolveWorkflowRunInputs({
      def,
      runPrompt: question,
      activeWikiId: this.wikiId,
      wikiIds,
    });
    if (resolved.error) {
      if (this.statusEl) this.statusEl.setText(resolved.error);
      return;
    }

    this.running = true;
    this.startElapsedTimer();
    this.clearWorkflowSubscriptions();

    if (this.statusEl) this.statusEl.setText(qv.workflowRunning);
    if (this.answerEl) {
      this.markdownComponent.unload();
      this.markdownComponent = new Component();
      this.answerEl.empty();
      this.answerEl.setText("…");
    }
    if (this.citationsEl) {
      this.citationsEl.empty();
      this.citationsEl.hide();
    }

    if (this.runPanelHost && this.runPanel) {
      this.runPanelHost.show();
      this.runPanel.expand();
      this.runPanel.reset(def);
    }

    let activeRootRunId: string | null = null;

    const offStarted = this.plugin.core.events.subscribe(
      "workflow:started",
      (payload) => {
        if (payload.workflowId !== def.id) return;
        activeRootRunId = payload.rootRunId;
      },
    );
    const offStep = this.plugin.core.events.subscribe("workflow:step", (step) => {
      if (activeRootRunId && step.rootRunId !== activeRootRunId) return;
      if (!activeRootRunId) activeRootRunId = step.rootRunId;
      this.runPanel?.applyStep(step);
    });
    this.workflowUnsubs.push(offStarted, offStep);

    try {
      const report = await this.plugin.workflow.run(def, resolved.inputs);
      await this.finishWorkflowQuery(def, report);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (this.answerEl) this.answerEl.setText(msg);
      if (this.statusEl) this.statusEl.setText(msg);
    } finally {
      this.running = false;
      this.stopElapsedTimer(true);
      this.clearWorkflowSubscriptions();
    }
  }

  private async finishWorkflowQuery(
    def: WorkflowDefinition,
    report: RunReport,
  ): Promise<void> {
    const tr = createTranslator();
    const qv = tr.queryViewMessages();

    if (report.status !== "completed") {
      const msg = report.error ?? `Workflow ${report.status}`;
      if (this.answerEl) this.answerEl.setText(msg);
      if (this.statusEl) this.statusEl.setText(msg);
      return;
    }

    const answer = extractQueryWorkflowAnswer(def, report);
    if (!answer) {
      if (this.answerEl) this.answerEl.setText(qv.workflowNoAnswer);
      if (this.statusEl) this.statusEl.setText(qv.workflowNoAnswer);
      return;
    }

    if (this.statusEl) this.statusEl.setText("");
    await this.renderAnswer(stripLlmNoise(answer), true);
  }

  private async renderAnswer(markdown: string, final = false): Promise<void> {
    if (!this.answerEl) return;
    this.answerEl.empty();
    const safe = sanitizeLlmMarkdown(markdown);
    if (!final) {
      this.answerEl.setText(safe);
      return;
    }
    await MarkdownRenderer.renderMarkdown(
      safe,
      this.answerEl,
      "",
      this.markdownComponent,
    );
  }

  private renderCitations(paths: string[]): void {
    if (!this.citationsEl || !paths.length) return;
    const tr = createTranslator();
    this.citationsEl.empty();
    this.citationsEl.show();
    this.citationsEl.createEl("strong", { text: tr.queryView("citations") });
    const list = this.citationsEl.createEl("ul");
    for (const path of paths) {
      const li = list.createEl("li");
      const safePath = path.replace(/^(javascript|data):/i, "");
      const link = li.createEl("a", {
        text: safePath,
        href: "#",
      });
      link.addEventListener("click", (event) => {
        event.preventDefault();
        void this.app.workspace.openLinkText(safePath, "", false);
      });
    }
  }
}

function formatElapsedSeconds(elapsed: number): string {
  if (elapsed < 10) return elapsed.toFixed(1);
  return String(Math.round(elapsed));
}

export async function openQueryView(
  plugin: WikiFlowPlugin,
  wikiId?: WikiId,
): Promise<void> {
  const leaf =
    plugin.app.workspace.getLeavesOfType(QUERY_VIEW_TYPE)[0] ??
    plugin.app.workspace.getLeaf("tab");
  await leaf.setViewState({ type: QUERY_VIEW_TYPE, active: true });
  const view = leaf.view;
  if (view instanceof QueryView && wikiId) {
    view.setWikiId(wikiId);
  }
}
