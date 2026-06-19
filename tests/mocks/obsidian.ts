/** Minimal obsidian mock for unit tests (Node / Vitest). */
export function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function getLanguage(): string {
  return "en";
}

export class Plugin {
  app = {};
  manifest = { version: "0.0.0" };
}

export class TFolder {
  children: { path: string }[] = [];
}

export class Notice {
  noticeEl = {
    classList: {
      _classes: new Set<string>(),
      add(name: string) {
        this._classes.add(name);
      },
      remove(name: string) {
        this._classes.delete(name);
      },
    },
    addClass(name: string) {
      this.classList.add(name);
    },
    removeClass(name: string) {
      this.classList.remove(name);
    },
  };

  constructor(
    public message: string,
    _timeout?: number,
  ) {}

  setMessage(message: string): void {
    this.message = message;
  }

  hide(): void {}
}

export class PluginSettingTab {}
export class Setting {}
export class DropdownComponent {
  selectEl = { empty: () => {} };
  addOption() {}
  setValue() {}
  onChange() {}
}

export function requestUrl() {
  return Promise.resolve({ status: 200, json: {}, text: "" });
}

export type Vault = unknown;
export type TFile = unknown;
export type TAbstractFile = unknown;
export type RequestUrlResponse = unknown;
