import type { WikiId } from "@shared/types/wiki-instance";
import type { RunReport, WorkflowDefinition } from "@shared/types/workflow";
import {
  Component,
  ItemView,
  MarkdownRenderer,
  Notice,
  WorkspaceLeaf,
  setIcon,
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
  private answerCardEl: HTMLElement | null = null;
  private emptyStateEl: HTMLElement | null = null;
  private citationsEl: HTMLElement | null = null;
  private lastAnswerText = "";
  private elapsedTextEl: HTMLElement | null = null;
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
    this.answerCardEl = null;
    this.emptyStateEl = null;
    this.citationsEl = null;
    this.elapsedEl = null;
    this.elapsedTextEl = null;
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
      container.createDiv({ cls: "wq-no-wiki", text: qv.noWiki });
      return;
    }

    if (!this.wikiId || !wikis.some((w) => w.wikiId === this.wikiId)) {
      this.wikiId = wikis[0].wikiId;
    }

    const isWorkflow = this.queryMode === "workflow";

    const scroll = container.createDiv({ cls: "wq-scroll" });
    const page = scroll.createDiv({ cls: "wq-page" });

    // ===== CONFIG CARD =====
    const config = page.createEl("section", { cls: "wq-card wq-config" });
    const fields = config.createDiv({ cls: "wq-fields" });

    const modeSelect = this.buildField(fields, {
      label: qv.mode,
      icon: "chevrons-up-down",
      mod: "mode",
    });
    modeSelect.createEl("option", { value: "wiki", text: qv.modeWiki });
    modeSelect.createEl("option", { value: "workflow", text: qv.modeWorkflow });
    modeSelect.value = this.queryMode;
    modeSelect.addEventListener("change", () => {
      this.queryMode = modeSelect.value as QueryMode;
      this.render();
    });

    const wikiSelect = this.buildField(fields, {
      label: qv.wiki,
      icon: "book-text",
    });
    for (const wiki of wikis) {
      wikiSelect.createEl("option", { value: wiki.wikiId, text: wiki.wikiId });
    }
    wikiSelect.value = this.wikiId!;
    wikiSelect.addEventListener("change", () => {
      this.wikiId = wikiSelect.value;
    });

    const workflowFiles = this.listWorkflowFiles();
    const wfSelect = this.buildField(fields, {
      label: qv.workflow,
      icon: "workflow",
      mod: "grow",
      mono: true,
    });
    if (isWorkflow && workflowFiles.length) {
      for (const path of workflowFiles) {
        wfSelect.createEl("option", { value: path, text: path });
      }
      if (!this.workflowPath || !workflowFiles.includes(this.workflowPath)) {
        this.workflowPath = workflowFiles[0];
      }
      wfSelect.value = this.workflowPath!;
      wfSelect.addEventListener("change", () => {
        this.workflowPath = wfSelect.value;
      });
    } else {
      wfSelect.createEl("option", {
        value: "",
        text: isWorkflow ? qv.noWorkflow : "—",
      });
      wfSelect.disabled = true;
      if (isWorkflow) this.workflowPath = null;
    }

    const hint = config.createDiv({ cls: "wq-config__hint" });
    setIcon(hint.createSpan({ cls: "wq-config__hint-icon" }), "info");
    hint.createSpan({
      cls: "wq-config__hint-text",
      text: isWorkflow
        ? `${qv.wikiDescWorkflow} · ${qv.workflowDesc}`
        : qv.wikiDesc,
    });

    // ===== PROMPTS (optional) =====
    const promptsHost = this.plugin.settings.showQueryPrompts
      ? page.createDiv({ cls: "wq-prompts" })
      : null;
    if (promptsHost) {
      const commitPrompt = async (
        key: "querySystemPrompt" | "queryUserPrompt",
        value: string,
      ) => {
        this.plugin.settings[key] = value;
        await this.plugin.saveSettings();
      };

      this.systemPromptSection = new QueryPromptSection(promptsHost.createDiv(), {
        title: qv.systemPrompt,
        hint: qv.promptVarsHint,
        value: effectiveQuerySystemPrompt(this.plugin.settings.querySystemPrompt),
        defaultValue: DEFAULT_QUERY_SYSTEM_PROMPT,
        resetLabel: qv.resetPrompt,
        rows: 5,
        collapsed: this.systemPromptCollapsed,
        onCollapsedChange: (collapsed) => {
          this.systemPromptCollapsed = collapsed;
        },
        onValueCommit: (value) => void commitPrompt("querySystemPrompt", value),
      });

      this.userPromptSection = new QueryPromptSection(promptsHost.createDiv(), {
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
      });
    } else {
      this.systemPromptSection = null;
      this.userPromptSection = null;
    }

    // ===== INPUT CARD =====
    const inputCard = page.createEl("section", { cls: "wq-card wq-input" });
    this.questionInput = inputCard.createEl("textarea", {
      cls: "wq-textarea",
      attr: {
        placeholder: isWorkflow
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

    const bar = inputCard.createDiv({ cls: "wq-bar" });
    const askBtn = bar.createEl("button", { cls: "wq-btn wq-btn--primary" });
    setIcon(askBtn.createSpan({ cls: "wq-btn__icon" }), "send");
    askBtn.createSpan({ text: qv.ask });
    askBtn.addEventListener("click", () => void this.runQuery());

    const clearBtn = bar.createEl("button", { cls: "wq-btn" });
    setIcon(clearBtn.createSpan({ cls: "wq-btn__icon" }), "trash-2");
    clearBtn.createSpan({ text: qv.clear });
    clearBtn.addEventListener("click", () => this.clearAnswer());

    bar.createDiv({ cls: "wq-bar__spacer" });

    this.elapsedEl = bar.createDiv({ cls: "wq-timer" });
    setIcon(this.elapsedEl.createSpan({ cls: "wq-timer__icon" }), "clock");
    this.elapsedTextEl = this.elapsedEl.createSpan({ cls: "wq-timer__text" });
    this.elapsedEl.hide();

    const kbd = bar.createDiv({ cls: "wq-kbd-hint" });
    kbd.createEl("kbd", { cls: "wq-kbd", text: "⌘⏎" });
    kbd.createSpan({ text: qv.submit });

    this.statusEl = inputCard.createDiv({ cls: "wq-status" });

    // ===== EMPTY STATE =====
    this.emptyStateEl = page.createEl("section", { cls: "wq-empty" });
    setIcon(this.emptyStateEl.createDiv({ cls: "wq-empty__icon" }), "message-square");
    this.emptyStateEl.createDiv({
      cls: "wq-empty__title",
      text: qv.emptyAnswerTitle,
    });
    this.emptyStateEl.createDiv({
      cls: "wq-empty__hint",
      text: qv.emptyAnswerHint,
    });

    // ===== ANSWER CARD =====
    this.answerCardEl = page.createEl("section", { cls: "wq-card wq-answer" });
    const answerHeader = this.answerCardEl.createDiv({ cls: "wq-answer__header" });
    setIcon(answerHeader.createDiv({ cls: "wq-answer__badge" }), "sparkles");
    answerHeader.createSpan({ cls: "wq-answer__title", text: qv.answerTitle });
    answerHeader.createSpan({ cls: "wq-answer__note", text: `· ${qv.answerNote}` });
    answerHeader.createDiv({ cls: "wq-bar__spacer" });
    const copyBtn = answerHeader.createEl("button", {
      cls: "wq-icon-btn",
      attr: { "aria-label": qv.copyAnswer, title: qv.copyAnswer },
    });
    setIcon(copyBtn, "copy");
    copyBtn.addEventListener("click", () => void this.copyAnswer());

    const answerBody = this.answerCardEl.createDiv({ cls: "wq-answer__body" });
    this.answerEl = answerBody.createDiv({
      cls: "wq-answer__content markdown-rendered",
    });
    this.citationsEl = answerBody.createDiv({ cls: "wq-citations" });
    this.citationsEl.hide();

    if (isWorkflow) {
      this.runPanelHost = answerBody.createDiv({ cls: "wq-run-host" });
      this.runPanel = this.createRunPanel(this.runPanelHost, qv.workflowRunTitle);
      this.runPanelHost.hide();
    } else {
      this.runPanelHost = null;
      this.runPanel = null;
    }

    this.answerCardEl.hide();

    // ===== STATUS PILL =====
    this.renderStatusPill(container, tr);
  }

  private buildField(
    parent: HTMLElement,
    opts: { label: string; icon: string; mod?: string; mono?: boolean },
  ): HTMLSelectElement {
    const field = parent.createDiv({
      cls: opts.mod ? `wq-field wq-field--${opts.mod}` : "wq-field",
    });
    field.createEl("label", { cls: "wq-field__label", text: opts.label });
    const control = field.createDiv({ cls: "wq-field__control" });
    setIcon(control.createSpan({ cls: "wq-field__icon" }), opts.icon);
    return control.createEl("select", {
      cls: opts.mono ? "wq-field__select wq-field__select--mono" : "wq-field__select",
    });
  }

  private renderStatusPill(
    container: HTMLElement,
    tr: ReturnType<typeof createTranslator>,
  ): void {
    const pill = container.createDiv({ cls: "wq-status-pill" });
    setIcon(pill.createSpan({ cls: "wq-status-pill__logo" }), "git-branch");
    pill.createSpan({ cls: "wq-status-pill__brand", text: "WikiFlow" });

    pill.createSpan({ cls: "wq-status-pill__sep", text: "·" });
    const llmReady = this.plugin.settings.llmReady;
    const llm = pill.createSpan({
      cls: llmReady
        ? "wq-status-pill__state is-ok"
        : "wq-status-pill__state is-off",
    });
    llm.createSpan({ cls: "wq-status-pill__dot" });
    llm.createSpan({
      text: llmReady ? tr.statusBar("llmReady") : tr.statusBar("llmNotConfigured"),
    });

    pill.createSpan({ cls: "wq-status-pill__sep", text: "·" });
    const provider = this.plugin.settings.backup.provider;
    pill.createSpan({
      cls: "wq-status-pill__muted",
      text:
        provider === "none"
          ? tr.statusBar("backupOff")
          : tr.statusBar("backupProvider", { provider }),
    });
  }

  private showAnswerCard(): void {
    this.emptyStateEl?.hide();
    this.answerCardEl?.show();
  }

  private showEmptyState(): void {
    this.answerCardEl?.hide();
    this.emptyStateEl?.show();
  }

  private async copyAnswer(): Promise<void> {
    const text = this.lastAnswerText.trim();
    if (!text) return;
    await navigator.clipboard.writeText(text);
    new Notice(createTranslator().queryView("copied"));
  }

  private clearAnswer(): void {
    const tr = createTranslator();
    const qv = tr.queryViewMessages();
    if (this.questionInput) this.questionInput.value = "";
    if (this.statusEl) this.statusEl.setText("");
    this.lastAnswerText = "";
    if (this.answerEl) {
      this.markdownComponent.unload();
      this.markdownComponent = new Component();
      this.answerEl.empty();
    }
    if (this.citationsEl) {
      this.citationsEl.empty();
      this.citationsEl.hide();
    }
    this.showEmptyState();
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
    if (this.elapsedEl) this.elapsedEl.hide();
    if (this.elapsedTextEl) this.elapsedTextEl.setText("");
  }

  private updateElapsedDisplay(final: boolean): void {
    if (!this.runStartedAt) return;
    const target = this.elapsedTextEl ?? this.elapsedEl;
    if (!target) return;
    const elapsed = (Date.now() - this.runStartedAt) / 1000;
    const seconds = final ? formatElapsedSeconds(elapsed) : String(Math.floor(elapsed));
    target.setText(createTranslator().queryView("elapsedSeconds", { seconds }));
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
    this.showAnswerCard();
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
    this.showAnswerCard();
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
    this.lastAnswerText = markdown;
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
