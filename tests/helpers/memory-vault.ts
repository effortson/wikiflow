import { normalizePath } from "obsidian";
import { VaultAdapter } from "../../src/core/vault/vault-adapter";

type FileEntry = { kind: "file"; content: string };
type FolderEntry = { kind: "folder" };

export class MemoryVault {
  private files = new Map<string, FileEntry | FolderEntry>();

  constructor() {
    this.mkdirp("workflows");
    this.mkdirp(".enterpriseflow/runs");
  }

  normalize(path: string): string {
    return normalizePath(path);
  }

  mkdirp(path: string): void {
    const parts = this.normalize(path).split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.files.has(current)) {
        this.files.set(current, { kind: "folder" });
      }
    }
  }

  write(path: string, content: string): void {
    const normalized = this.normalize(path);
    this.mkdirp(normalized.split("/").slice(0, -1).join("/"));
    this.files.set(normalized, { kind: "file", content });
  }

  read(path: string): string {
    const entry = this.files.get(this.normalize(path));
    if (!entry || entry.kind !== "file") {
      throw new Error(`File not found: ${path}`);
    }
    return entry.content;
  }

  exists(path: string): boolean {
    return this.files.has(this.normalize(path));
  }

  listFolder(path: string): string[] {
    const prefix = `${this.normalize(path)}/`;
    const children = new Set<string>();
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      const segment = rest.split("/")[0];
      if (segment) children.add(`${this.normalize(path)}/${segment}`);
    }
    return [...children];
  }

  remove(path: string): void {
    this.files.delete(this.normalize(path));
  }

  asAdapter(): VaultAdapter {
    const mem = this;
    const vault = {
      getAbstractFileByPath(path: string) {
        const normalized = mem.normalize(path);
        const entry = mem.files.get(normalized);
        if (!entry) return null;
        if (entry.kind === "file") {
          return { path: normalized, extension: normalized.split(".").pop() };
        }
        return {
          path: normalized,
          children: mem.listFolder(normalized).map((p) => ({
            path: p,
          })),
        };
      },
      adapter: {
        read: (path: string) => Promise.resolve(mem.read(path)),
        write: (path: string, content: string) => {
          mem.write(path, content);
          return Promise.resolve();
        },
        readBinary: () => Promise.resolve(new ArrayBuffer(0)),
        writeBinary: () => Promise.resolve(),
        mkdir: (path: string) => {
          mem.mkdirp(path);
          return Promise.resolve();
        },
        remove: (path: string) => {
          mem.remove(path);
          return Promise.resolve();
        },
        rmdir: (path: string) => {
          mem.remove(path);
          return Promise.resolve();
        },
      },
    };

    return new VaultAdapter(vault as never);
  }
}
