import type { VaultAdapter } from "../../core/vault/vault-adapter";
import type { WikiInstance } from "@shared/types/wiki-instance";

export async function writeWikiIndex(
  vault: VaultAdapter,
  wiki: WikiInstance,
): Promise<void> {
  const sources = await listMd(`${wiki.wikiRoot}/sources`, vault);
  const entities = await listMd(`${wiki.wikiRoot}/entities`, vault);
  const concepts = await listMd(`${wiki.wikiRoot}/concepts`, vault);

  const lines = [
    `# ${wiki.wikiId} Wiki Index`,
    "",
    `_Updated ${new Date().toISOString()}_`,
    "",
    "## Sources",
    ...sources.map(linkLine),
    "",
    "## Entities",
    ...entities.map(linkLine),
    "",
    "## Concepts",
    ...concepts.map(linkLine),
    "",
  ];

  await vault.mkdir(wiki.wikiRoot);
  await vault.writeText(`${wiki.wikiRoot}/index.md`, `${lines.join("\n")}\n`);
}

async function listMd(folder: string, vault: VaultAdapter): Promise<string[]> {
  if (!(await vault.exists(folder))) return [];
  return vault.listFolder(folder).filter((p) => p.endsWith(".md")).sort();
}

function linkLine(path: string): string {
  const name = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
  return `- [[${path}|${name}]]`;
}
