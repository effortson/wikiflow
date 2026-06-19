import { normalizePath, TFolder, type Vault } from "obsidian";

export class VaultAdapter {
  constructor(private readonly vault: Vault) {}

  normalize(path: string): string {
    return normalizePath(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.vault.getAbstractFileByPath(this.normalize(path)) !== null;
  }

  async readText(path: string): Promise<string> {
    return this.vault.adapter.read(this.normalize(path));
  }

  async writeText(path: string, content: string): Promise<void> {
    const normalized = this.normalize(path);
    await this.ensureParentDirs(normalized);
    await this.vault.adapter.write(normalized, content);
  }

  async readBinary(path: string): Promise<ArrayBuffer> {
    return this.vault.adapter.readBinary(this.normalize(path));
  }

  async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    const normalized = this.normalize(path);
    await this.ensureParentDirs(normalized);
    await this.vault.adapter.writeBinary(normalized, data);
  }

  async mkdir(path: string): Promise<void> {
    const normalized = this.normalize(path);
    if (await this.exists(normalized)) return;
    await this.vault.adapter.mkdir(normalized);
  }

  listFolder(path: string): string[] {
    const folder = this.vault.getAbstractFileByPath(this.normalize(path));
    if (!(folder instanceof TFolder)) return [];
    return folder.children.map((child) => child.path);
  }

  getVault(): Vault {
    return this.vault;
  }

  private async ensureParentDirs(path: string): Promise<void> {
    const parts = path.split("/");
    if (parts.length <= 1) return;
    await this.mkdir(parts.slice(0, -1).join("/"));
  }
}
