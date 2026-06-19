/** Trim pasted keys: whitespace, optional Bearer prefix, quotes, zero-width chars. */
export function normalizeApiKey(raw: string): string {
  let key = raw.trim();
  key = key.replace(/^Bearer\s+/i, "");
  key = key.replace(/^["']|["']$/g, "");
  key = key.replace(/[\u200B-\u200D\uFEFF]/g, "");
  return key.trim();
}

function hostLooksLikeDeepSeek(baseUrl: string): boolean {
  try {
    const url = new URL(
      baseUrl.trim().includes("://") ? baseUrl.trim() : `https://${baseUrl.trim()}`,
    );
    return url.hostname.toLowerCase().includes("deepseek");
  } catch {
    return /deepseek/i.test(baseUrl);
  }
}

function hostLooksLikeMiniMax(baseUrl: string): boolean {
  try {
    const url = new URL(
      baseUrl.trim().includes("://") ? baseUrl.trim() : `https://${baseUrl.trim()}`,
    );
    return url.hostname.toLowerCase().includes("minimax");
  } catch {
    return /minimax/i.test(baseUrl);
  }
}

/**
 * Detect common provider / key mismatches before calling the API.
 * Returns a user-facing hint, or null when nothing obvious is wrong.
 */
export function diagnoseLlmConfigIssue(
  apiKey: string,
  baseUrl: string,
): string | null {
  const key = normalizeApiKey(apiKey);
  if (!key) return null;

  if (key.startsWith("sk-cp-")) {
    if (hostLooksLikeDeepSeek(baseUrl)) {
      return (
        "This key (sk-cp-…) is a MiniMax Token Plan key, not a DeepSeek key. " +
        "Use base URL https://api.minimax.io/v1 with a MiniMax model (e.g. MiniMax-M3), " +
        "or use a DeepSeek key from platform.deepseek.com with https://api.deepseek.com."
      );
    }
    if (!hostLooksLikeMiniMax(baseUrl)) {
      return (
        "Keys starting with sk-cp- are MiniMax Token Plan keys. " +
        "Set base URL to https://api.minimax.io/v1 and a MiniMax model name."
      );
    }
  }

  return null;
}

/** Extra context for 401 responses when the server rejects the bearer token. */
export function hintForLlmAuthFailure(
  apiKey: string,
  baseUrl: string,
): string | null {
  const configHint = diagnoseLlmConfigIssue(apiKey, baseUrl);
  if (configHint) return configHint;

  const key = normalizeApiKey(apiKey);
  if (key.startsWith("sk-cp-") && hostLooksLikeDeepSeek(baseUrl)) {
    return (
      "Authentication failed: sk-cp- keys are issued by MiniMax, not DeepSeek."
    );
  }

  return null;
}
