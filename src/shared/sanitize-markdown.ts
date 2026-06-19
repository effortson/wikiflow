/** Strip dangerous HTML from LLM-generated markdown before rendering. */
export function sanitizeLlmMarkdown(markdown: string): string {
  return markdown
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/\bon\w+\s*=/gi, "data-blocked=");
}
