import type { SourceLocator } from "@shared/types/normalized-document";

export function formatLocator(locator: SourceLocator): string {
  switch (locator.kind) {
    case "pdf":
      return `pdf p.${locator.page}`;
    case "docx":
      return locator.section
        ? `docx § ${locator.section}`
        : `docx ¶${locator.paragraphIndex ?? "?"}`;
    case "xlsx":
      return locator.range
        ? `Sheet: ${locator.sheet}, ${locator.range}`
        : `Sheet: ${locator.sheet}`;
    case "image":
      return "image";
    case "plain":
      return locator.label ?? "plain";
    default:
      return "source";
  }
}
