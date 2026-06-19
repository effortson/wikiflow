import { requestUrl, type RequestUrlResponse } from "obsidian";
import type { PluginSettings } from "../config/settings";
import { Logger } from "../log/logger";
import { abortable, throwIfAborted } from "@shared/abort";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMChatOptions {
  messages: ChatMessage[];
  signal?: AbortSignal;
  temperature?: number;
  /** Request OpenAI-compatible JSON object mode when supported. */
  jsonMode?: boolean;
}

export interface LLMVisionOptions {
  prompt: string;
  mimeType: string;
  base64: string;
  signal?: AbortSignal;
  model?: string;
  temperature?: number;
}

export interface LLMService {
  chat(options: LLMChatOptions): Promise<string>;
  vision(options: LLMVisionOptions): Promise<string>;
  testConnection(): Promise<string>;
  chatStream?(
    options: LLMChatOptions,
  ): AsyncIterable<string>;
}

export class OpenAICompatibleLLMService implements LLMService {
  constructor(
    private getSettings: () => PluginSettings,
    private logger: Logger,
  ) {}

  async chat(options: LLMChatOptions): Promise<string> {
    const settings = this.getSettings();
    if (!settings.apiKey) {
      throw new Error("LLM API key is not configured");
    }

    const url = `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`;

    const response = await abortable(
      requestUrl({
        url,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: settings.model,
          messages: options.messages,
          temperature: options.temperature ?? 0.2,
          stream: false,
          ...(options.jsonMode
            ? { response_format: { type: "json_object" } }
            : {}),
        }),
        throw: false,
      }),
      options.signal,
      "LLM request cancelled",
    );

    throwIfAborted(options.signal, "LLM request cancelled");

    if (response.status >= 400) {
      this.logger.error("LLM request failed", {
        status: response.status,
        body: response.text?.slice(0, 240),
      });
      throw new Error(formatLlmHttpError(response));
    }

    const json = response.json as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (content == null) {
      throw new Error("LLM response missing content");
    }
    return content;
  }

  async vision(options: LLMVisionOptions): Promise<string> {
    const settings = this.getSettings();
    if (!settings.apiKey) {
      throw new Error("LLM API key is not configured");
    }

    const url = `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const dataUrl = `data:${options.mimeType};base64,${options.base64}`;

    const response = await abortable(
      requestUrl({
        url,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model ?? settings.model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: options.prompt },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
          temperature: options.temperature ?? 0.1,
          stream: false,
        }),
        throw: false,
      }),
      options.signal,
      "LLM vision request cancelled",
    );

    throwIfAborted(options.signal, "LLM vision request cancelled");

    if (response.status >= 400) {
      this.logger.error("LLM vision request failed", {
        status: response.status,
        body: response.text?.slice(0, 240),
      });
      throw new Error(formatLlmHttpError(response, "LLM vision request failed"));
    }

    const json = response.json as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (content == null) {
      throw new Error("LLM vision response missing content");
    }
    return content;
  }

  async testConnection(): Promise<string> {
    const settings = this.getSettings();
    if (!settings.apiKey) {
      throw new Error("LLM API key is not configured");
    }
    if (!settings.model.trim()) {
      throw new Error("LLM model is not configured");
    }

    const url = `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const response = await requestUrl({
      url,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify({
        model: settings.model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 8,
        temperature: 0,
        stream: false,
      }),
      throw: false,
    });

    if (response.status >= 400) {
      this.logger.error("LLM test connection failed", {
        status: response.status,
        body: response.text,
      });
      throw new Error(formatLlmHttpError(response, "LLM test failed"));
    }

    const json = response.json as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (content == null) {
      throw new Error("LLM test response missing content");
    }
    return content.trim();
  }
}

function formatLlmHttpError(
  response: RequestUrlResponse,
  prefix = "LLM request failed",
): string {
  const body = response.text?.trim();
  if (!body) {
    return `${prefix} (${response.status})`;
  }
  try {
    const json = JSON.parse(body) as {
      error?: { message?: string };
      message?: string;
    };
    const detail = json.error?.message ?? json.message ?? body;
    return `${prefix} (${response.status}): ${detail}`;
  } catch {
    return `${prefix} (${response.status}): ${body.slice(0, 240)}`;
  }
}
