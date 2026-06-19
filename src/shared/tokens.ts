/** v0 token estimate: ceil(charCount / 4). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
