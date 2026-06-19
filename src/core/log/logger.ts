import type { PluginSettings } from "../config/settings";

export type LogLevel = "debug" | "info" | "warn" | "error";

export class Logger {
  constructor(private settings: () => PluginSettings) {}

  debug(message: string, data?: Record<string, unknown>): void {
    if (!this.settings().debug) return;
    this.emit("debug", message, data);
  }

  info(message: string, data?: Record<string, unknown>): void {
    this.emit("info", message, data);
  }

  warn(message: string, data?: Record<string, unknown>): void {
    this.emit("warn", message, data);
  }

  error(message: string, data?: Record<string, unknown>): void {
    this.emit("error", message, data);
  }

  private emit(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    const prefix = `[EnterpriseFlow:${level}]`;
    if (data) {
      console.log(prefix, message, data);
    } else {
      console.log(prefix, message);
    }
  }
}
