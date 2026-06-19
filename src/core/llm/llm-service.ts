import { requestUrl, type RequestUrlResponse } from "obsidian";
import type { PluginSettings } from "../config/settings";
import { Logger } from "../log/logger";
import { abortable, throwIfAborted } from "@shared/abort";
import {
  diagnoseLlmConfigIssue,
  hintForLlmAuthFailure,
  normalizeApiKey,
} from "@shared/llm-api-key";
import { resolveChatCompletionsUrl } from "@shared/llm-url";

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
    const apiKey = normalizeApiKey(settings.apiKey);
    if (!apiKey) {
      throw new Error("LLM API key is not configured");
    }

    const configIssue = diagnoseLlmConfigIssue(apiKey, settings.baseUrl);
    if (configIssue) {
      throw new Error(configIssue);
    }

    const url = resolveChatCompletionsUrl(settings.baseUrl);

    const response = await abortable(
      requestUrl({
        url,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
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
      throw new Error(
        formatLlmHttpError(response, "LLM request failed", apiKey, settings.baseUrl),
      );
    }

    const json = response.json as {
      choices?: {
        message?: {
          content?: string | null;
          reasoning_content?: string | null;
        };
      }[];
    };
    const content = extractAssistantText(json.choices?.[0]?.message);
    if (content == null) {
      throw new Error("LLM response missing content");
    }
    return content;
  }

  async vision(options: LLMVisionOptions): Promise<string> {
    const settings = this.getSettings();
    const apiKey = normalizeApiKey(settings.apiKey);
    if (!apiKey) {
      throw new Error("LLM API key is not configured");
    }

    const url = resolveChatCompletionsUrl(settings.baseUrl);
    const dataUrl = `data:${options.mimeType};base64,${options.base64}`;

    const response = await abortable(
      requestUrl({
        url,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
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
      throw new Error(
        formatLlmHttpError(
          response,
          "LLM vision request failed",
          apiKey,
          settings.baseUrl,
        ),
      );
    }

    const json = response.json as {
      choices?: {
        message?: {
          content?: string | null;
          reasoning_content?: string | null;
        };
      }[];
    };
    const content = extractAssistantText(json.choices?.[0]?.message);
    if (content == null) {
      throw new Error("LLM vision response missing content");
    }
    return content;
  }

  async testConnection(): Promise<string> {
    const settings = this.getSettings();
    const apiKey = normalizeApiKey(settings.apiKey);
    if (!apiKey) {
      throw new Error("LLM API key is not configured");
    }
    if (!settings.model.trim()) {
      throw new Error("LLM model is not configured");
    }

    const configIssue = diagnoseLlmConfigIssue(apiKey, settings.baseUrl);
    if (configIssue) {
      throw new Error(configIssue);
    }

    const url = resolveChatCompletionsUrl(settings.baseUrl);
    const response = await requestUrl({
      url,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
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
      throw new Error(
        formatLlmHttpError(response, "LLM test failed", apiKey, settings.baseUrl),
      );
    }

    const json = response.json as {
      choices?: {
        message?: {
          content?: string | null;
          reasoning_content?: string | null;
        };
      }[];
    };
    const content = extractAssistantText(json.choices?.[0]?.message);
    if (content == null) {
      throw new Error("LLM test response missing content");
    }
    return content;
  }
}

function extractAssistantText(
  message:
    | {
        content?: string | null;
        reasoning_content?: string | null;
      }
    | undefined,
): string | null {
  if (!message) return null;
  const content = message.content?.trim();
  if (content) return content;
  const reasoning = message.reasoning_content?.trim();
  if (reasoning) return reasoning;
  return null;
}

function formatLlmHttpError(
  response: RequestUrlResponse,
  prefix = "LLM request failed",
  apiKey = "",
  baseUrl = "",
): string {
  const body = response.text?.trim();
  let detail = "";
  if (!body) {
    detail = String(response.status);
  } else {
    try {
      const json = JSON.parse(body) as {
        error?: { message?: string };
        message?: string;
      };
      detail = json.error?.message ?? json.message ?? body;
    } catch {
      detail = body.slice(0, 240);
    }
  }

  if (response.status === 401 && apiKey) {
    const hint = hintForLlmAuthFailure(apiKey, baseUrl);
    if (hint) {
      return `${prefix} (${response.status}): ${detail}. ${hint}`;
    }
  }

  return body ? `${prefix} (${response.status}): ${detail}` : `${prefix} (${response.status})`;
}
