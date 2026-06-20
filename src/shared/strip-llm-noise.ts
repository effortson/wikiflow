const THINKING_BLOCK_RE =
  /<(?:think|redacted_thinking)>[\s\S]*?<\/(?:think|redacted_thinking)>/gi;

/** Remove model reasoning wrappers from LLM text output. */
export function stripLlmNoise(text: string): string {
  let out = text.replace(THINKING_BLOCK_RE, "");
  out = out.replace(
    /<(?:think|redacted_thinking)>[\s\S]*?(?=\n[^\n]*[\u4e00-\u9fff])/gi,
    "",
  );
  // Only drop an *unclosed* thinking wrapper at the very start of the output
  // (a truncated/streamed reasoning block). Anchoring to the start avoids
  // erasing the tail of a legitimate answer that merely mentions `<think>`.
  out = out.replace(/^\s*<(?:think|redacted_thinking)>[\s\S]*/i, "");
  return out.trim();
}
