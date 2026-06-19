/** Simple glob matching; patterns are relative to wiki raw root. */
export function matchGlob(relativePath: string, pattern: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  const pat = pattern.replace(/\\/g, "/");

  if (pat === "**" || pat === "**/*") return true;

  const regex = pat
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\0")
    .replace(/\*/g, "[^/]*")
    .replace(/\0/g, ".*")
    .replace(/\?/g, ".");

  return new RegExp(`^${regex}$`).test(normalized);
}
