import type { WorkflowContext } from "../runtime/context";

export type JsonSchema = Record<string, unknown>;

export interface NodeTypeDefinition {
  type: string;
  label: string;
  inputs: JsonSchema;
  outputs: JsonSchema;
  execute(
    ctx: WorkflowContext,
    config: Record<string, unknown>,
    inputs: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
}

export class NodeRegistry {
  private types = new Map<string, NodeTypeDefinition>();

  register(def: NodeTypeDefinition): void {
    this.types.set(def.type, def);
  }

  get(type: string): NodeTypeDefinition | undefined {
    return this.types.get(type);
  }

  has(type: string): boolean {
    return this.types.has(type);
  }

  list(): NodeTypeDefinition[] {
    return [...this.types.values()];
  }
}
