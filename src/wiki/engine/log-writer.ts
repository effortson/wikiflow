import type { VaultAdapter } from "../../core/vault/vault-adapter";
import type { WikiInstance } from "@shared/types/wiki-instance";

export async function appendWikiLog(
  vault: VaultAdapter,
  wiki: WikiInstance,
  entry: {
    action: string;
    sourceId: string;
    created: number;
    updated: number;
  },
): Promise<void> {
  const logPath = `${wiki.wikiRoot}/log.md`;
  const line = `- ${new Date().toISOString()} **${entry.action}** \`${entry.sourceId}\` (+${entry.created} / ~${entry.updated})\n`;
  if (await vault.exists(logPath)) {
    const existing = await vault.readText(logPath);
    await vault.writeText(logPath, `${existing.trimEnd()}\n${line}`);
  } else {
    await vault.mkdir(wiki.wikiRoot);
    await vault.writeText(logPath, `# Wiki Log (${wiki.wikiId})\n\n${line}`);
  }
}
