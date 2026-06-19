import { stripLlmNoise } from "@shared/strip-llm-noise";

/** Strip dangerous HTML and model thinking blocks from LLM-generated markdown. */
export function sanitizeLlmMarkdown(markdown: string): string {
  return stripLlmNoise(markdown)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/\bon\w+\s*=/gi, "data-blocked=");
}
