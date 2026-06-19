import { describe, expect, it } from "vitest";
import { clampSettings, DEFAULT_SETTINGS } from "../src/core/config/settings";

describe("saveSettings object identity", () => {
  it("clampSettings can be applied in place without replacing the object", () => {
    const settings = { ...DEFAULT_SETTINGS, apiKey: "  sk-test  ", model: " gpt-4o " };
    const ref = settings;

    Object.assign(settings, clampSettings(settings));

    expect(settings).toBe(ref);
    expect(settings.apiKey).toBe("sk-test");
    expect(settings.model).toBe("gpt-4o");
  });

  it("preserves mutations through stale UI closures after in-place clamp", () => {
    const settings = { ...DEFAULT_SETTINGS };
    const uiClosure = settings;

    Object.assign(settings, clampSettings({ ...settings, baseUrl: "https://api.example.com/v1" }));
    uiClosure.apiKey = "sk-from-ui";
    uiClosure.model = "deepseek-chat";

    expect(settings.apiKey).toBe("sk-from-ui");
    expect(settings.model).toBe("deepseek-chat");
  });
});
