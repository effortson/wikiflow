export interface QueryPromptSectionOptions {
  title: string;
  hint?: string;
  value: string;
  rows?: number;
  collapsed?: boolean;
  resetLabel?: string;
  defaultValue?: string;
  onCollapsedChange?: (collapsed: boolean) => void;
  onValueCommit?: (value: string) => void;
}

export class QueryPromptSection {
  private collapsed: boolean;
  private bodyEl: HTMLElement;
  private chevronEl: HTMLElement;
  private textarea: HTMLTextAreaElement;
  private readonly defaultValue: string;

  constructor(
    private container: HTMLElement,
    private options: QueryPromptSectionOptions,
  ) {
    this.collapsed = options.collapsed ?? true;
    this.defaultValue = options.defaultValue ?? "";

    container.addClass("wikiflow-query-prompt");

    const header = container.createDiv({ cls: "wikiflow-query-prompt__header" });
    const toggle = header.createEl("button", {
      cls: "wikiflow-query-prompt__toggle",
      type: "button",
    });
    this.chevronEl = toggle.createSpan({
      cls: "wikiflow-query-prompt__chevron",
      text: "▸",
    });
    toggle.createSpan({
      cls: "wikiflow-query-prompt__title",
      text: options.title,
    });
    toggle.addEventListener("click", () => {
      this.setCollapsed(!this.collapsed);
    });

    if (options.resetLabel && options.defaultValue !== undefined) {
      const resetBtn = header.createEl("button", {
        cls: "wikiflow-query-prompt__reset",
        text: options.resetLabel,
        type: "button",
      });
      resetBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        this.textarea.value = this.defaultValue;
        options.onValueCommit?.(this.defaultValue);
      });
    }

    this.bodyEl = container.createDiv({ cls: "wikiflow-query-prompt__body" });
    if (options.hint) {
      this.bodyEl.createDiv({
        cls: "wikiflow-query-prompt__hint",
        text: options.hint,
      });
    }
    this.textarea = this.bodyEl.createEl("textarea", {
      cls: "wikiflow-query-prompt__input",
      attr: { rows: String(options.rows ?? 4) },
    });
    this.textarea.value = options.value;
    this.textarea.addEventListener("blur", () => {
      options.onValueCommit?.(this.textarea.value);
    });

    this.applyCollapsed();
  }

  getValue(): string {
    return this.textarea.value;
  }

  setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    this.applyCollapsed();
    this.options.onCollapsedChange?.(collapsed);
  }

  private applyCollapsed(): void {
    this.container.toggleClass("is-collapsed", this.collapsed);
    this.chevronEl.setText(this.collapsed ? "▸" : "▾");
    if (this.collapsed) {
      this.bodyEl.hide();
    } else {
      this.bodyEl.show();
    }
  }
}
