import type { WikiId } from "@shared/types/wiki-instance";
import {
  Component,
  ItemView,
  MarkdownRenderer,
  Setting,
  WorkspaceLeaf,
} from "obsidian";
import { createTranslator } from "../i18n";
import type { EnterpriseFlowPlugin } from "../main";
import { sanitizeLlmMarkdown } from "@shared/sanitize-markdown";
import styles from "./query-view.css";

export const QUERY_VIEW_TYPE = "enterpriseflow-query";

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
  private questionInput: HTMLTextAreaElement | null = null;
  private statusEl: HTMLElement | null = null;
  private answerEl: HTMLElement | null = null;
  private citationsEl: HTMLElement | null = null;
  private markdownComponent = new Component();
  private running = false;

  constructor(
    leaf: WorkspaceLeaf,
    private plugin: EnterpriseFlowPlugin,
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

  async onOpen(): Promise<void> {
    ensureQueryStyles();
    if (!this.wikiId) {
      this.wikiId = this.defaultWikiId();
    }
    this.render();
  }

  async onClose(): Promise<void> {
    this.markdownComponent.unload();
    this.questionInput = null;
    this.statusEl = null;
    this.answerEl = null;
    this.citationsEl = null;
  }

  private defaultWikiId(): WikiId | null {
    const active = this.plugin.settings.activeWikiId;
    const wikis = this.plugin.getWikiInstances();
    if (active && wikis.some((w) => w.wikiId === active)) return active;
    return wikis[0]?.wikiId ?? null;
  }

  private render(): void {
    const tr = createTranslator();
    const qv = tr.queryViewMessages();
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("enterpriseflow-query-view");

    const wikis = this.plugin.getWikiInstances();
    if (!wikis.length) {
      container.createEl("p", { text: qv.noWiki });
      return;
    }

    if (!this.wikiId || !wikis.some((w) => w.wikiId === this.wikiId)) {
      this.wikiId = wikis[0].wikiId;
    }

    const toolbar = container.createDiv({ cls: "enterpriseflow-query-toolbar" });
    new Setting(toolbar)
      .setName(qv.wiki)
      .setDesc(qv.wikiDesc)
      .addDropdown((dropdown) => {
        for (const wiki of wikis) {
          dropdown.addOption(wiki.wikiId, wiki.wikiId);
        }
        dropdown.setValue(this.wikiId!);
        dropdown.onChange((value) => {
          this.wikiId = value;
        });
      });

    this.questionInput = container.createEl("textarea", {
      cls: "enterpriseflow-query-question",
      attr: { placeholder: qv.questionPlaceholder },
    });
    this.questionInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void this.runQuery();
      }
    });

    const actions = container.createDiv({ cls: "enterpriseflow-query-actions" });
    const askBtn = actions.createEl("button", {
      cls: "mod-cta",
      text: qv.ask,
    });
    askBtn.addEventListener("click", () => void this.runQuery());

    const clearBtn = actions.createEl("button", { text: qv.clear });
    clearBtn.addEventListener("click", () => this.clearAnswer());

    this.statusEl = container.createDiv({ cls: "enterpriseflow-query-status" });
    this.statusEl.setText(qv.hint);

    const body = container.createDiv({ cls: "enterpriseflow-query-body" });
    this.answerEl = body.createDiv({ cls: "enterpriseflow-query-answer" });
    this.answerEl.setText(qv.emptyAnswer);
    this.citationsEl = body.createDiv({ cls: "enterpriseflow-query-citations" });
    this.citationsEl.hide();
  }

  private clearAnswer(): void {
    const tr = createTranslator();
    if (this.questionInput) this.questionInput.value = "";
    if (this.statusEl) this.statusEl.setText(tr.queryView("hint"));
    if (this.answerEl) {
      this.markdownComponent.unload();
      this.markdownComponent = new Component();
      this.answerEl.empty();
      this.answerEl.setText(tr.queryView("emptyAnswer"));
    }
    if (this.citationsEl) {
      this.citationsEl.empty();
      this.citationsEl.hide();
    }
  }

  private async runQuery(): Promise<void> {
    const tr = createTranslator();
    const qv = tr.queryViewMessages();
    const question = this.questionInput?.value.trim() ?? "";
    if (!question || this.running || !this.wikiId) return;

    if (!this.plugin.settings.llmReady) {
      if (this.statusEl) this.statusEl.setText(qv.llmNotConfigured);
      return;
    }

    this.running = true;
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
      for await (const chunk of this.plugin.wiki.query(this.wikiId, question)) {
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
    }
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

export async function openQueryView(
  plugin: EnterpriseFlowPlugin,
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
