import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Edge, Node } from "@xyflow/react";
import type { WorkflowNodeRunSnapshot } from "@shared/types/workflow-step";
import { formatWorkflowRecordJson } from "@shared/workflow-step-snapshot";
import {
  formatNodeOutputsBagTemplate,
  formatOutputTemplate,
  getNodeCatalogEntry,
  listUpstreamNodes,
  type NodeFieldSchema,
} from "./node-schemas";
import type { WorkflowNodeData } from "./workflow-adapter";
import { defaultNodeId } from "./node-id";
import { getNodeInitial, getNodeTheme } from "./node-theme";
import {
  DeleteIcon,
  DuplicateIcon,
  EmptyInspectorIcon,
  InspectorIcon,
} from "./workflow-ui-icons";

interface NodeInspectorProps {
  node: Node<WorkflowNodeData> | null;
  nodes: Node<WorkflowNodeData>[];
  edges: Edge[];
  workflowFiles: string[];
  wikiIds: string[];
  nodeRun?: WorkflowNodeRunSnapshot | null;
  onChange: (nodeId: string, config: Record<string, unknown>) => void;
  onNodeIdChange: (nodeId: string, draft: string) => string | undefined;
  onDelete: (nodeId: string) => void;
}

export function NodeInspector({
  node,
  nodes,
  edges,
  workflowFiles,
  wikiIds,
  nodeRun,
  onChange,
  onNodeIdChange,
  onDelete,
}: NodeInspectorProps) {
  const catalog = useMemo(
    () => (node ? getNodeCatalogEntry(node.data.nodeType) : undefined),
    [node],
  );

  const upstreamHints = useMemo(() => {
    if (!node) return [];
    const upstreamIds = listUpstreamNodes(node.id, edges);
    return upstreamIds.flatMap((upstreamId) => {
      const upstreamNode = nodes.find((n) => n.id === upstreamId);
      if (!upstreamNode) return [];
      const upstreamCatalog = getNodeCatalogEntry(upstreamNode.data.nodeType);
      if (!upstreamCatalog?.outputs.length) return [];
      return upstreamCatalog.outputs
        .filter((port) => port.key !== "*")
        .map((port) => ({
          nodeId: upstreamId,
          nodeLabel: upstreamNode.data.label,
          port,
          template: formatOutputTemplate(upstreamId, port.key),
        }));
    });
  }, [node, nodes, edges]);

  const upstreamBagTemplate = useMemo(() => {
    if (!node) return [];
    return listUpstreamNodes(node.id, edges).map((upstreamId) => {
      const upstreamNode = nodes.find((n) => n.id === upstreamId);
      return {
        nodeId: upstreamId,
        nodeLabel: upstreamNode?.data.label ?? upstreamId,
        template: formatNodeOutputsBagTemplate(upstreamId),
      };
    });
  }, [node, nodes, edges]);

  if (!node || !catalog) {
    return (
      <div className="ef-inspector">
        <div className="ef-inspector__head">
          <InspectorIcon />
          <span>Inspector</span>
        </div>
        <div className="ef-inspector-empty">
          <div className="ef-inspector-empty__icon">
            <EmptyInspectorIcon />
          </div>
          <div className="ef-inspector-empty__title">No node selected</div>
          <p>Select a node on the canvas to edit its configuration.</p>
        </div>
      </div>
    );
  }

  const theme = getNodeTheme(node.data.nodeType);

  const updateField = (key: string, value: unknown) => {
    onChange(node.id, { ...node.data.config, [key]: value });
  };

  return (
    <div className="ef-inspector">
      <div className="ef-inspector__head">
        <InspectorIcon />
        <span>Inspector</span>
      </div>

      <div
        className="ef-inspector-card"
        style={
          {
            "--ef-accent": theme.accent,
            "--ef-accent-soft": theme.soft,
          } as CSSProperties
        }
      >
        <div className="ef-inspector-card__hero">
          <div className="ef-inspector-card__avatar">
            {getNodeInitial(catalog.label)}
          </div>
          <div className="ef-inspector-card__meta">
            <div className="ef-inspector-card__name">{catalog.label}</div>
            <span className="ef-inspector-card__badge">{theme.label}</span>
          </div>
        </div>
        <NodeIdEditor
          nodeId={node.id}
          nodeType={node.data.nodeType}
          takenIds={nodes.filter((entry) => entry.id !== node.id).map((entry) => entry.id)}
          onCommit={(draft) => onNodeIdChange(node.id, draft)}
        />
      </div>

      <div className="ef-inspector-section-title">CONFIGURATION</div>

      {catalog.fields.length === 0 ? (
        <p className="ef-muted">This node has no configuration.</p>
      ) : null}

      {catalog.fields.map((field) => (
        <FieldEditor
          key={field.key}
          field={field}
          value={node.data.config[field.key]}
          workflowFiles={workflowFiles}
          wikiIds={wikiIds}
          onChange={(value) => updateField(field.key, value)}
        />
      ))}

      <div className="ef-inspector-actions">
        <button type="button" className="ef-inspector-action" disabled>
          <DuplicateIcon />
          Duplicate
        </button>
        <button
          type="button"
          className="ef-inspector-action ef-inspector-action--danger"
          onClick={() => onDelete(node.id)}
        >
          <DeleteIcon />
          Delete
        </button>
      </div>

      {node.data.errorMessages && node.data.errorMessages.length > 0 ? (
        <div className="ef-inspector-errors">
          {node.data.errorMessages.map((msg) => (
            <div key={msg}>{msg}</div>
          ))}
        </div>
      ) : null}

      <OutputsPanel
        nodeId={node.id}
        outputs={catalog.outputs}
        upstreamBagTemplate={upstreamBagTemplate}
        upstreamHints={upstreamHints}
      />

      <RunIoPanel run={nodeRun} />
    </div>
  );
}

function NodeIdEditor({
  nodeId,
  nodeType,
  takenIds,
  onCommit,
}: {
  nodeId: string;
  nodeType: string;
  takenIds: string[];
  onCommit: (draft: string) => string | undefined;
}) {
  const [draft, setDraft] = useState(nodeId);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    setDraft(nodeId);
    setError(undefined);
  }, [nodeId]);

  const placeholder = defaultNodeId(nodeType, new Set(takenIds));

  const commit = () => {
    const message = onCommit(draft);
    if (message) {
      setError(message);
      setDraft(nodeId);
      return;
    }
    setError(undefined);
  };

  return (
    <div className="ef-inspector-card__row ef-inspector-card__row--id">
      <span className="ef-inspector-card__row-label">Node ID</span>
      <div className="ef-inspector-card__id-field">
        <input
          className="ef-inspector-card__id-input"
          type="text"
          value={draft}
          placeholder={placeholder}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(undefined);
          }}
          onBlur={() => commit()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
        />
        <span className="ef-inspector-card__id-hint">
          Leave empty for default: <code>{placeholder}</code>
        </span>
        {error ? <span className="ef-inspector-card__id-error">{error}</span> : null}
      </div>
    </div>
  );
}

function OutputsPanel({
  nodeId,
  outputs,
  upstreamBagTemplate,
  upstreamHints,
}: {
  nodeId: string;
  outputs: { key: string; label: string; description?: string }[];
  upstreamBagTemplate: { nodeId: string; nodeLabel: string; template: string }[];
  upstreamHints: {
    nodeId: string;
    nodeLabel: string;
    port: { key: string; label: string; description?: string };
    template: string;
  }[];
}) {
  return (
    <div className="ef-outputs-panel">
      <h4>Outputs</h4>
      <ul className="ef-outputs-list">
        <li>
          <code>{formatNodeOutputsBagTemplate(nodeId)}</code>
          <span className="ef-muted"> — entire output object</span>
        </li>
        {outputs.filter((o) => o.key !== "*").map((port) => (
          <li key={port.key}>
            <code>{formatOutputTemplate(nodeId, port.key)}</code>
            {port.description ? (
              <span className="ef-muted"> — {port.description}</span>
            ) : null}
          </li>
        ))}
      </ul>

      {upstreamBagTemplate.length || upstreamHints.length ? (
        <>
          <h4>Upstream templates</h4>
          <p className="ef-muted">
            Use whole-string templates in config. <code>.output</code> = full outputs;
            <code>.field</code> = one key.
          </p>
          {upstreamBagTemplate.length ? (
            <ul className="ef-outputs-list">
              {upstreamBagTemplate.map((hint) => (
                <li key={`bag-${hint.nodeId}`}>
                  <code>{hint.template}</code>
                  <span className="ef-muted"> — {hint.nodeLabel} (all outputs)</span>
                </li>
              ))}
            </ul>
          ) : null}
          {upstreamHints.length ? (
            <ul className="ef-outputs-list">
              {upstreamHints.map((hint) => (
                <li key={`${hint.nodeId}-${hint.port.key}`}>
                  <code>{hint.template}</code>
                  <span className="ef-muted">
                    {" "}
                    — {hint.nodeLabel}.{hint.port.key}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function RunIoPanel({ run }: { run?: WorkflowNodeRunSnapshot | null }) {
  if (!run) {
    return (
      <div className="ef-run-io ef-run-io--empty">
        <h4>Run I/O</h4>
        <p className="ef-muted">Run the workflow to see step inputs and outputs here.</p>
      </div>
    );
  }

  const statusLabel =
    run.phase === "started"
      ? "running"
      : run.phase === "completed"
        ? "completed"
        : "failed";

  return (
    <div className="ef-run-io">
      <h4>
        Run I/O{" "}
        <span className={`ef-run-io__badge ef-run-io__badge--${run.phase}`}>
          {statusLabel}
        </span>
      </h4>
      {run.durationMs !== undefined ? (
        <div className="ef-muted ef-run-io__meta">{run.durationMs} ms</div>
      ) : null}
      <IoBlock title="Inputs" data={run.inputs} />
      <IoBlock title="Config (resolved)" data={run.config} />
      <IoBlock title="Outputs" data={run.outputs} />
      {run.error ? (
        <div className="ef-inspector-errors">{run.error}</div>
      ) : null}
    </div>
  );
}

function IoBlock({
  title,
  data,
}: {
  title: string;
  data?: Record<string, unknown>;
}) {
  if (!data || Object.keys(data).length === 0) return null;
  return (
    <div className="ef-io-block">
      <div className="ef-io-block__title">{title}</div>
      <pre className="ef-io-block__json">{formatWorkflowRecordJson(data)}</pre>
    </div>
  );
}

function FieldEditor({
  field,
  value,
  workflowFiles,
  wikiIds,
  onChange,
}: {
  field: NodeFieldSchema;
  value: unknown;
  workflowFiles: string[];
  wikiIds: string[];
  onChange: (value: unknown) => void;
}) {
  const label = `${field.label}${field.required ? " *" : ""}`;

  if (field.type === "workflow-ref") {
    return (
      <label className="ef-field">
        <span>{label}</span>
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select workflow…</option>
          {workflowFiles.map((path) => (
            <option key={path} value={path}>
              {path}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className="ef-field">
        <span>{label}</span>
        <select
          value={String(value ?? field.options?.[0]?.value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "json") {
    const text =
      typeof value === "string"
        ? value
        : value !== undefined
          ? JSON.stringify(value, null, 2)
          : "";
    return (
      <label className="ef-field">
        <span>{label}</span>
        <textarea
          rows={4}
          placeholder={field.placeholder}
          value={text}
          onChange={(e) => {
            const raw = e.target.value.trim();
            if (!raw) {
              onChange(undefined);
              return;
            }
            try {
              onChange(JSON.parse(raw));
            } catch {
              onChange(raw);
            }
          }}
        />
      </label>
    );
  }

  if (field.type === "text") {
    return (
      <label className="ef-field">
        <span>{label}</span>
        <textarea
          rows={3}
          placeholder={field.placeholder}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }

  if (field.key === "wikiId" && wikiIds.length > 0) {
    return (
      <label className="ef-field">
        <span>{label}</span>
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">—</option>
          {wikiIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="ef-field">
      <span>{label}</span>
      <input
        type="text"
        placeholder={field.placeholder}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
