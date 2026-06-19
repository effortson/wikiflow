/** Resolve OpenAI-compatible `POST …/chat/completions` URL from a configured base URL. */
export function resolveChatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("LLM base URL is not configured");
  }
  if (trimmed.endsWith("/chat/completions")) {
    return trimmed;
  }

  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    if (trimmed.endsWith("/v1")) {
      return `${trimmed}/chat/completions`;
    }
    return `${trimmed}/v1/chat/completions`;
  }

  const host = url.hostname.toLowerCase();
  const path = url.pathname.replace(/\/+$/, "") || "";

  // DeepSeek: https://api.deepseek.com/chat/completions (no /v1 prefix)
  if (host === "api.deepseek.com") {
    return `${url.protocol}//${url.host}/chat/completions`;
  }

  if (path.endsWith("/v1")) {
    return `${url.protocol}//${url.host}${path}/chat/completions`;
  }

  if (path === "") {
    return `${url.protocol}//${url.host}/v1/chat/completions`;
  }

  return `${trimmed}/chat/completions`;
}
