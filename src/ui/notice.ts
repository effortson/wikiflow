import { Notice } from "obsidian";
import type { LogLevel } from "../core/log/logger";

export interface ShowNoticeOptions {
  timeout?: number;
  level?: LogLevel;
  data?: Record<string, unknown>;
}

/** Mirror notice text to DevTools console (filter: EnterpriseFlow). */
export function logNotice(
  message: string,
  level: LogLevel = "info",
  data?: Record<string, unknown>,
): void {
  const prefix = `[EnterpriseFlow:${level}]`;
  if (data) {
    console.log(prefix, message, data);
  } else {
    console.log(prefix, message);
  }
}

export function showNotice(
  message: string,
  options: ShowNoticeOptions = {},
): Notice {
  const level = options.level ?? "info";
  logNotice(message, level, options.data);
  return new Notice(message, options.timeout);
}
