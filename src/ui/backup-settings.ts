import { Setting } from "obsidian";
import { createTranslator, formatMessage } from "../i18n";
import { showNotice } from "./notice";
import type { SettingsMessages } from "../i18n/types";
import type { EnterpriseFlowPlugin } from "../main";
import type {
  BackupSettings,
  GitHubBackupSettings,
  S3BackupSettings,
} from "@shared/types/backup";

const BACKUP_COMMON_DEFAULT = {
  scope: "enterpriseflow" as const,
  includeExtractCache: false,
  excludePatterns: [] as string[],
  scheduleEnabled: false,
  scheduleIntervalHours: 24,
  retentionCount: 10,
};

export function renderBackupSettings(
  containerEl: HTMLElement,
  plugin: EnterpriseFlowPlugin,
): void {
  const tr = createTranslator();
  const s = tr.settings();

  containerEl.createEl("h3", { text: s.headings.remoteBackup });

  const settings = plugin.settings;
  let provider = settings.backup.provider;

  new Setting(containerEl)
    .setName(s.backup.provider)
    .setDesc(s.backup.providerDesc)
    .addDropdown((dropdown) => {
      dropdown.addOption("none", s.backup.none);
      dropdown.addOption("s3", s.backup.s3);
      dropdown.addOption("github", s.backup.github);
      dropdown.setValue(provider);
      dropdown.onChange(async (value) => {
        provider = value as BackupSettings["provider"];
        settings.backup = createBackupSettings(provider, settings.backup);
        await plugin.saveSettings();
        plugin.refreshBackupSchedule();
        plugin.refreshStatusBar();
        plugin.refreshSettingsDisplay();
      });
    });

  if (provider === "none") return;

  const backup = settings.backup as S3BackupSettings | GitHubBackupSettings;
  const common = backup;

  new Setting(containerEl)
    .setName(s.backup.scope)
    .addDropdown((dropdown) => {
      dropdown.addOption("enterpriseflow", s.backup.scopeEnterpriseFlow);
      dropdown.addOption("full", s.backup.scopeFull);
      dropdown.setValue(common.scope);
      dropdown.onChange(async (value) => {
        common.scope = value as "full" | "enterpriseflow";
        await plugin.saveSettings();
      });
    });

  new Setting(containerEl)
    .setName(s.backup.includeExtractCache)
    .addToggle((toggle) =>
      toggle.setValue(common.includeExtractCache).onChange(async (value) => {
        common.includeExtractCache = value;
        await plugin.saveSettings();
      }),
    );

  new Setting(containerEl)
    .setName(s.backup.retentionCount)
    .setDesc(s.backup.retentionCountDesc)
    .addText((text) =>
      text.setValue(String(common.retentionCount)).onChange(async (value) => {
        const n = Number(value);
        common.retentionCount = Number.isFinite(n) ? Math.max(1, n) : 10;
        await plugin.saveSettings();
      }),
    );

  new Setting(containerEl)
    .setName(s.backup.scheduled)
    .addToggle((toggle) =>
      toggle.setValue(common.scheduleEnabled).onChange(async (value) => {
        common.scheduleEnabled = value;
        await plugin.saveSettings();
        plugin.refreshBackupSchedule();
      }),
    );

  new Setting(containerEl)
    .setName(s.backup.scheduleInterval)
    .addText((text) =>
      text
        .setValue(String(common.scheduleIntervalHours))
        .onChange(async (value) => {
          const n = Number(value);
          common.scheduleIntervalHours = Number.isFinite(n)
            ? Math.max(1, n)
            : 24;
          await plugin.saveSettings();
          plugin.refreshBackupSchedule();
        }),
    );

  if (provider === "s3") {
    renderS3Fields(containerEl, backup as S3BackupSettings, plugin, s.s3);
  } else if (provider === "github") {
    renderGitHubFields(
      containerEl,
      backup as GitHubBackupSettings,
      plugin,
      s.github,
    );
  }

  new Setting(containerEl).addButton((btn) =>
    btn.setButtonText(s.backup.testConnection).onClick(() => {
      void plugin.core.backup
        .testConnection()
        .then(() => showNotice(s.backup.connectionOk))
        .catch((err: unknown) =>
          showNotice(
            formatMessage(s.backup.connectionFailed, {
              message: err instanceof Error ? err.message : String(err),
            }),
            { level: "error" },
          ),
        );
    }),
  );
}

function renderS3Fields(
  containerEl: HTMLElement,
  backup: S3BackupSettings,
  plugin: EnterpriseFlowPlugin,
  labels: SettingsMessages["s3"],
): void {
  const fields: [keyof S3BackupSettings, string][] = [
    ["endpoint", labels.endpoint],
    ["region", labels.region],
    ["bucket", labels.bucket],
    ["prefix", labels.prefix],
    ["accessKeyId", labels.accessKeyId],
    ["secretAccessKey", labels.secretAccessKey],
  ];

  for (const [key, label] of fields) {
    new Setting(containerEl)
      .setName(label)
      .addText((text) =>
        text.setValue(String(backup[key] ?? "")).onChange(async (value) => {
          if (key === "endpoint") backup.endpoint = value;
          else if (key === "region") backup.region = value;
          else if (key === "bucket") backup.bucket = value;
          else if (key === "prefix") backup.prefix = value;
          else if (key === "accessKeyId") backup.accessKeyId = value;
          else if (key === "secretAccessKey") backup.secretAccessKey = value;
          await plugin.saveSettings();
        }),
      );
  }

  new Setting(containerEl)
    .setName(labels.forcePathStyle)
    .setDesc(labels.forcePathStyleDesc)
    .addToggle((toggle) =>
      toggle.setValue(Boolean(backup.forcePathStyle)).onChange(async (value) => {
        backup.forcePathStyle = value;
        await plugin.saveSettings();
      }),
    );
}

function renderGitHubFields(
  containerEl: HTMLElement,
  backup: GitHubBackupSettings,
  plugin: EnterpriseFlowPlugin,
  labels: SettingsMessages["github"],
): void {
  const fields: [keyof GitHubBackupSettings, string, boolean?][] = [
    ["owner", labels.owner],
    ["repo", labels.repo],
    ["branch", labels.branch],
    ["pathPrefix", labels.pathPrefix],
    ["token", labels.token, true],
  ];

  for (const [key, label, secret] of fields) {
    new Setting(containerEl)
      .setName(label)
      .addText((text) => {
        if (secret) text.inputEl.type = "password";
        text.setValue(String(backup[key] ?? "")).onChange(async (value) => {
          if (key === "owner") backup.owner = value;
          else if (key === "repo") backup.repo = value;
          else if (key === "branch") backup.branch = value;
          else if (key === "pathPrefix") backup.pathPrefix = value;
          else if (key === "token") backup.token = value;
          await plugin.saveSettings();
        });
      });
  }
}

function createBackupSettings(
  provider: BackupSettings["provider"],
  current: BackupSettings,
): BackupSettings {
  const common =
    current.provider === "none"
      ? BACKUP_COMMON_DEFAULT
      : {
          scope: current.scope,
          includeExtractCache: current.includeExtractCache,
          excludePatterns: current.excludePatterns,
          scheduleEnabled: current.scheduleEnabled,
          scheduleIntervalHours: current.scheduleIntervalHours,
          retentionCount: current.retentionCount,
        };

  if (provider === "none") return { provider: "none" };

  if (provider === "s3") {
    const prev = current.provider === "s3" ? current : null;
    return {
      provider: "s3",
      ...common,
      endpoint: prev?.endpoint ?? "",
      region: prev?.region ?? "us-east-1",
      bucket: prev?.bucket ?? "",
      prefix: prev?.prefix ?? "enterpriseflow",
      accessKeyId: prev?.accessKeyId ?? "",
      secretAccessKey: prev?.secretAccessKey ?? "",
      forcePathStyle: prev?.forcePathStyle ?? false,
    };
  }

  const prev = current.provider === "github" ? current : null;
  return {
    provider: "github",
    ...common,
    owner: prev?.owner ?? "",
    repo: prev?.repo ?? "",
    branch: prev?.branch ?? "main",
    pathPrefix: prev?.pathPrefix ?? "vault-backups",
    token: prev?.token ?? "",
  };
}
