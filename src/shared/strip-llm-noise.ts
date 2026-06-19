const THINKING_BLOCK_RE =
  /<(?:think|redacted_thinking)>[\s\S]*?<\/(?:think|redacted_thinking)>/gi;

/** Remove model reasoning wrappers from LLM text output. */
export function stripLlmNoise(text: string): string {
  let out = text.replace(THINKING_BLOCK_RE, "");
  out = out.replace(
    /<(?:think|redacted_thinking)>[\s\S]*?(?=\n[^\n]*[\u4e00-\u9fff])/gi,
    "",
  );
  out = out.replace(/<(?:think|redacted_thinking)>[\s\S]*/gi, "");
  return out.trim();
}
