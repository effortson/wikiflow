import { App, Modal, Setting } from "obsidian";

export interface UserInputModalOptions {
  prompt: string;
  placeholder?: string;
  defaultValue?: string;
}

export function promptUserInput(
  app: App,
  options: UserInputModalOptions,
): Promise<string | null> {
  return new Promise((resolve) => {
    new UserInputModal(app, options, resolve).open();
  });
}

class UserInputModal extends Modal {
  private value: string;
  private resolved = false;
  private errorEl: HTMLElement | null = null;

  constructor(
    app: App,
    private options: UserInputModalOptions,
    private onResolve: (value: string | null) => void,
  ) {
    super(app);
    this.value = options.defaultValue ?? "";
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ef-user-input-modal");

    contentEl.createEl("h2", { text: "运行工作流" });
    contentEl.createEl("p", {
      cls: "ef-user-input-modal__prompt",
      text: this.options.prompt,
    });

    const inputArea = contentEl.createEl("textarea", {
      cls: "ef-user-input-modal__input",
      attr: {
        rows: "4",
        placeholder: this.options.placeholder ?? "请输入内容",
      },
    });
    inputArea.value = this.value;
    inputArea.addEventListener("input", () => {
      this.value = inputArea.value;
      this.clearError();
    });
    inputArea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        this.submit();
      }
    });

    this.errorEl = contentEl.createDiv({ cls: "ef-user-input-modal__error" });

    new Setting(contentEl)
      .addButton((btn) =>
        btn.setButtonText("取消").onClick(() => {
          this.finish(null);
          this.close();
        }),
      )
      .addButton((btn) =>
        btn.setButtonText("运行").setCta().onClick(() => {
          this.submit();
        }),
      );

    window.setTimeout(() => {
      inputArea.focus();
      inputArea.setSelectionRange(inputArea.value.length, inputArea.value.length);
    }, 0);
  }

  private submit(): void {
    const text = this.value.trim();
    if (!text) {
      this.showError("请输入内容后再运行");
      return;
    }
    this.finish(text);
    this.close();
  }

  private showError(message: string): void {
    this.errorEl?.setText(message);
  }

  private clearError(): void {
    this.errorEl?.setText("");
  }

  private finish(value: string | null): void {
    if (this.resolved) return;
    this.resolved = true;
    this.onResolve(value);
  }

  onClose(): void {
    if (!this.resolved) {
      this.finish(null);
    }
    this.contentEl.empty();
  }
}
