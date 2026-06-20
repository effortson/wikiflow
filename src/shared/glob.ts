/** Simple glob matching; patterns are relative to wiki raw root. */
export function matchGlob(relativePath: string, pattern: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  const pat = pattern.replace(/\\/g, "/");

  if (pat === "**" || pat === "**/*") return true;

  const regex = pat
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    // Translate glob wildcards in one pass (longest token first):
    //  `**/` -> zero or more path segments, so `**/x` also matches top-level `x`
    //  `**`  -> anything, including `/`
    //  `*`   -> anything except `/`
    //  `?`   -> a single non-separator character
    .replace(/\*\*\/|\*\*|\*|\?/g, (token) => {
      if (token === "**/") return "(?:.*/)?";
      if (token === "**") return ".*";
      if (token === "*") return "[^/]*";
      return ".";
    });

  return new RegExp(`^${regex}$`).test(normalized);
}
