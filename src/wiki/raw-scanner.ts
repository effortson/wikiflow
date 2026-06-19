import { TFile, TFolder, type Vault } from "obsidian";
import type { Logger } from "../core/log/logger";
import { createTranslator } from "../i18n";
import { showNotice } from "../ui/notice";

export function scanRawRootViolations(
  vault: Vault,
  rawFolder: string,
): string[] {
  const folder = vault.getAbstractFileByPath(rawFolder);
  if (!(folder instanceof TFolder)) return [];

  return folder.children
    .filter((child): child is TFile => child instanceof TFile)
    .map((f) => f.path);
}

export function notifyRawRootViolations(
  violations: string[],
  logger: Logger,
): void {
  if (!violations.length) return;

  logger.warn("raw/ root contains files outside wiki folders", {
    count: violations.length,
    paths: violations.slice(0, 5),
  });

  const preview = violations
    .slice(0, 3)
    .map((p) => p.split("/").pop())
    .join(", ");
  const tr = createTranslator();
  const more =
    violations.length > 3
      ? tr.notice("rawRootViolationMore", { count: violations.length - 3 })
      : "";

  showNotice(
    tr.notice("rawRootViolation", { preview, more }),
    { timeout: 10_000, level: "warn" },
  );
}
