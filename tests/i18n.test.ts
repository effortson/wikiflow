import { describe, expect, it } from "vitest";
import {
  createTranslator,
  formatMessage,
  resolveUiLocale,
} from "../src/i18n";

describe("i18n", () => {
  it("maps Obsidian Chinese locale codes to zh", () => {
    expect(resolveUiLocale("zh")).toBe("zh");
    expect(resolveUiLocale("zh-CN")).toBe("zh");
    expect(resolveUiLocale("zh-TW")).toBe("zh");
  });

  it("falls back to en for other locales", () => {
    expect(resolveUiLocale("en")).toBe("en");
    expect(resolveUiLocale("ja")).toBe("en");
  });

  it("formats command names and notices", () => {
    const tr = createTranslator("zh-CN");
    // Bare command name — Obsidian prepends the plugin name itself, so the
    // translator must not add its own "WikiFlow:" prefix (would double up).
    expect(tr.command("ingestCurrentFile")).toBe("Source → Wiki：当前文件");
    expect(tr.notice("ingestingFile", { name: "a.pdf" })).toBe(
      "正在摄取 a.pdf…",
    );
  });

  it("interpolates template variables", () => {
    expect(formatMessage("Hello {name}", { name: "World" })).toBe("Hello World");
  });

  it("localizes settings labels in Chinese", () => {
    const tr = createTranslator("zh-CN");
    expect(tr.settings().llm.apiKey).toBe("LLM API 密钥");
    expect(tr.settings().llm.testConnection).toBe("测试 LLM 连接");
    expect(tr.settings().wiki.language).toBe("Wiki 语言");
    expect(tr.settings().backup.provider).toBe("备份提供商");
  });
});
