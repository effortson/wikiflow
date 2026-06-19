/** Vault-safe slug from a display name (supports CJK and latin). */
export function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return base || "untitled";
}

export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  let candidate = slugify(base);
  if (!(await exists(candidate))) return candidate;

  for (let i = 2; i < 1000; i++) {
    const next = `${candidate}-${i}`;
    if (!(await exists(next))) return next;
  }
  throw new Error(`Could not allocate unique slug for "${base}"`);
}
