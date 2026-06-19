import { App, DropdownComponent, PluginSettingTab, Setting } from "obsidian";
import type { EnterpriseFlowPlugin } from "../main";
import { createTranslator, formatMessage } from "../i18n";
import { showNotice } from "./notice";
import { renderBackupSettings } from "./backup-settings";

export class EnterpriseFlowSettingTab extends PluginSettingTab {
  private wikiDropdown: DropdownComponent | null = null;

  constructor(
    app: App,
    private plugin: EnterpriseFlowPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("enterpriseflow-settings");
    this.wikiDropdown = null;

    const tr = createTranslator();
    const s = tr.settings();
    const settings = this.plugin.settings;

    containerEl.createEl("h2", { text: tr.messages().pluginName });

    new Setting(containerEl)
      .setName(s.llm.apiKey)
      .setDesc(s.llm.apiKeyDesc)
      .addText((text) =>
        text
          .setPlaceholder("sk-...")
          .setValue(settings.apiKey)
          .onChange(async (value) => {
            settings.apiKey = value;
            settings.llmReady = Boolean(value && settings.model);
            await this.plugin.saveSettings();
            this.plugin.refreshStatusBar();
          }),
      );

    new Setting(containerEl)
      .setName(s.llm.baseUrl)
      .setDesc(s.llm.baseUrlDesc)
      .addText((text) =>
        text.setValue(settings.baseUrl).onChange(async (value) => {
          settings.baseUrl = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName(s.llm.model)
      .addText((text) =>
        text.setValue(settings.model).onChange(async (value) => {
          settings.model = value;
          settings.llmReady = Boolean(settings.apiKey && value);
          await this.plugin.saveSettings();
          this.plugin.refreshStatusBar();
        }),
      );

    new Setting(containerEl)
      .setName(s.llm.testConnection)
      .setDesc(s.llm.testConnectionDesc)
      .addButton((btn) =>
        btn.setButtonText(s.llm.testConnection).onClick(() => {
          void this.testLlmConnection();
        }),
      );

    containerEl.createEl("h3", { text: s.headings.paths });

    const pathKeys = [
      ["rawFolder", s.paths.rawFolder],
      ["sourceFolder", s.paths.sourceFolder],
      ["wikiRoot", s.paths.wikiRoot],
      ["schemaRoot", s.paths.schemaRoot],
      ["workflowsFolder", s.paths.workflowsFolder],
    ] as const;

    for (const [key, label] of pathKeys) {
      new Setting(containerEl)
        .setName(label)
        .setDesc(s.paths.relativeDesc)
        .addText((text) =>
          text.setValue(settings[key]).onChange(async (value) => {
            settings[key] = value;
            await this.plugin.saveSettings();
            this.refreshWikiDropdown();
          }),
        );
    }

    containerEl.createEl("h3", { text: s.headings.wiki });

    new Setting(containerEl)
      .setName(s.wiki.activeWiki)
      .setDesc(s.wiki.activeWikiDesc)
      .addDropdown((dropdown) => {
        this.wikiDropdown = dropdown;
        this.populateWikiDropdown(dropdown);
      });

    new Setting(containerEl)
      .setName(s.wiki.language)
      .setDesc(s.wiki.languageDesc)
      .addDropdown((dropdown) => {
        dropdown.addOption("zh", s.wiki.languageZh);
        dropdown.addOption("en", s.wiki.languageEn);
        dropdown.setValue(settings.language).onChange(async (value) => {
          settings.language = value === "en" ? "en" : "zh";
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName(s.wiki.fileDebounce)
      .setDesc(s.wiki.fileDebounceDesc)
      .addText((text) =>
        text
          .setValue(String(settings.fileAddedDebounceSeconds))
          .onChange(async (value) => {
            const n = Number(value);
            settings.fileAddedDebounceSeconds = Number.isFinite(n) ? n : 5;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName(s.wiki.debugLogging)
      .addToggle((toggle) =>
        toggle.setValue(settings.debug).onChange(async (value) => {
          settings.debug = value;
          await this.plugin.saveSettings();
        }),
      );

    renderBackupSettings(containerEl, this.plugin);
  }

  refreshWikiDropdown(): void {
    if (!this.wikiDropdown) return;
    this.populateWikiDropdown(this.wikiDropdown);
  }

  private testLlmConnection(): void {
    const tr = createTranslator();
    const s = tr.settings();
    const settings = this.plugin.settings;

    if (!settings.apiKey.trim() || !settings.model.trim()) {
      showNotice(s.llm.testMissingConfig, { level: "warn" });
      return;
    }

    void this.plugin.core.llm
      .testConnection()
      .then(() => {
        settings.llmReady = true;
        void this.plugin.saveSettings();
        this.plugin.refreshStatusBar();
        showNotice(s.llm.testSuccess);
      })
      .catch((err) => {
        settings.llmReady = false;
        void this.plugin.saveSettings();
        this.plugin.refreshStatusBar();
        const message = err instanceof Error ? err.message : String(err);
        showNotice(formatMessage(s.llm.testFailed, { message }), {
          level: "error",
        });
      });
  }

  private populateWikiDropdown(dropdown: DropdownComponent): void {
    const settings = this.plugin.settings;
    const wikis = this.plugin.getWikiInstances();
    const noneLabel = createTranslator().settings().wiki.none;

    dropdown.selectEl.empty();
    dropdown.addOption("", noneLabel);
    for (const w of wikis) {
      dropdown.addOption(w.wikiId, w.wikiId);
    }
    dropdown.setValue(settings.activeWikiId ?? "");
    dropdown.onChange(async (value) => {
      settings.activeWikiId = value || undefined;
      await this.plugin.saveSettings();
    });
  }
}
