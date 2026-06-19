import { NODE_CATALOG, type NodeCatalogEntry } from "./node-schemas";
import { NodeIcon } from "./node-icons";
import { getNodeCategoryClass } from "./node-theme";

interface NodePaletteProps {
  onAdd: (type: string) => void;
}

const CATEGORY_LABELS: Record<NodeCatalogEntry["category"], string> = {
  trigger: "TRIGGERS",
  wiki: "WIKI",
  flow: "FLOW",
  llm: "LLM",
  vault: "VAULT",
  output: "OUTPUT",
};

export function NodePalette({ onAdd }: NodePaletteProps) {
  const categories = [...new Set(NODE_CATALOG.map((n) => n.category))];

  return (
    <aside className="ef-palette">
      <div className="ef-palette__head">
        <span className="ef-palette__title">Nodes</span>
        <span className="ef-palette__count">{NODE_CATALOG.length}</span>
      </div>

      {categories.map((category) => (
        <div key={category} className="ef-palette-group">
          <div className="ef-palette-group__title">{CATEGORY_LABELS[category]}</div>
          {NODE_CATALOG.filter((n) => n.category === category).map((node) => (
            <button
              key={node.type}
              type="button"
              className={`ef-palette-item ${getNodeCategoryClass(node.type)}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/enterpriseflow-node", node.type);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => onAdd(node.type)}
            >
              <span className="ef-palette-item__icon" aria-hidden>
                <NodeIcon nodeType={node.type} size={17} />
              </span>
              <span className="ef-palette-item__label">{node.label}</span>
            </button>
          ))}
        </div>
      ))}
    </aside>
  );
}
