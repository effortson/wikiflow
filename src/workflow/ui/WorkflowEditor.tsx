import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type OnSelectionChangeParams,
  ReactFlowProvider,
} from "@xyflow/react";
import type { RunReport, WorkflowDefinition } from "@shared/types/workflow";
import type {
  WorkflowNodeRunSnapshot,
  WorkflowStepEvent,
} from "@shared/types/workflow-step";
import type { ValidationResult } from "@shared/types/validation";
import { WorkflowNodeComponent } from "./WorkflowNodeComponent";
import { WorkflowRunEdge } from "./WorkflowRunEdge";
import { NodePalette } from "./NodePalette";
import { NodeInspector } from "./NodeInspector";
import { RunTreePanel } from "./RunTreePanel";
import type { WorkflowEditorDeps, WorkflowMeta } from "./workflow-editor-deps";
import {
  applyValidationToNodes,
  applyNodeIdChange,
  collectNodeValidationErrors,
  createEdgeId,
  createEmptyWorkflow,
  createNodeFromCatalog,
  definitionToFlow,
  flowToDefinition,
  type WorkflowNodeData,
} from "./workflow-adapter";
import {
  applyRunVisualsToEdges,
  applyRunVisualsToNodes,
} from "./run-visuals";
import { resolveWorkflowRunInputs, getUserInputPromptLabel } from "./run-inputs";
import {
  PencilIcon,
  ReloadIcon,
  RunIcon,
  SaveIcon,
  StatusCheckIcon,
  ValidateIcon,
  WorkflowLogoIcon,
} from "./workflow-ui-icons";

export interface WorkflowEditorProps {
  deps: WorkflowEditorDeps;
  activePath?: string | null;
}

const nodeTypes = { workflowNode: WorkflowNodeComponent };
const edgeTypes = { workflowRun: WorkflowRunEdge };

function WorkflowEditorInner({ deps, activePath }: WorkflowEditorProps) {
  const [definition, setDefinition] = useState<WorkflowDefinition>(() =>
    createEmptyWorkflow(),
  );
  const [meta, setMeta] = useState<WorkflowMeta>(() => ({
    name: definition.name,
    id: definition.id,
    description: definition.description,
  }));
  const [filePath, setFilePath] = useState<string | null>(activePath ?? null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [runReport, setRunReport] = useState<RunReport | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [statusKind, setStatusKind] = useState<"info" | "error" | "running">("info");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [flowRevision, setFlowRevision] = useState(0);
  const loadGenerationRef = useRef(0);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const publishMeta = useCallback(
    (next: WorkflowMeta) => {
      deps.onWorkflowMetaChange?.(next);
    },
    [deps],
  );

  const applyMeta = useCallback(
    (next: WorkflowMeta) => {
      setMeta(next);
      publishMeta(next);
    },
    [publishMeta],
  );

  const [nodeRunStates, setNodeRunStates] = useState<
    Record<string, WorkflowNodeRunSnapshot>
  >({});

  const clearRunStates = useCallback(() => {
    setNodeRunStates({});
  }, []);

  const applyWorkflowStep = useCallback((step: WorkflowStepEvent) => {
    setNodeRunStates((prev) => {
      const existing = prev[step.nodeId];
      const next: WorkflowNodeRunSnapshot = {
        nodeType: step.nodeType,
        phase: step.phase,
        startedAt: step.startedAt,
        finishedAt: step.finishedAt,
        durationMs: step.durationMs,
        error: step.error,
        inputs: step.inputs ?? existing?.inputs,
        config: step.config ?? existing?.config,
        outputs: step.outputs ?? existing?.outputs,
      };
      return { ...prev, [step.nodeId]: next };
    });
  }, []);

  const initial = useMemo(() => definitionToFlow(definition), [definition]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<WorkflowNodeData>>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const reactFlowWrapper = useRef<HTMLDivElement | null>(null);
  const reactFlow = useRef<{ screenToFlowPosition: (p: { x: number; y: number }) => { x: number; y: number } } | null>(null);

  const workflowFiles = useMemo(
    () => deps.listWorkflowFiles(),
    [deps, filePath],
  );

  const wikiIds = useMemo(() => deps.listWikiIds(), [deps]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  const visualNodes = useMemo(
    () => applyRunVisualsToNodes(nodes, nodeRunStates),
    [nodes, nodeRunStates],
  );

  const visualEdges = useMemo(
    () => applyRunVisualsToEdges(edges, nodeRunStates),
    [edges, nodeRunStates],
  );

  const isWorkflowRunning = Boolean(activeRunId) || runReport?.status === "running";

  const syncDefinition = useCallback(
    (nextNodes: Node<WorkflowNodeData>[], nextEdges: Edge[]) => {
      setDefinition((prev) => flowToDefinition(prev, nextNodes, nextEdges));
    },
    [],
  );

  const loadWorkflow = useCallback(
    async (path: string) => {
      const generation = ++loadGenerationRef.current;
      try {
        const def = await deps.loadWorkflow(path);
        if (generation !== loadGenerationRef.current) return;

        const flow = definitionToFlow(def);
        const nextMeta: WorkflowMeta = {
          name: def.name,
          id: def.id,
          description: def.description,
        };
        setDefinition(def);
        applyMeta(nextMeta);
        setNodes(flow.nodes);
        setEdges(flow.edges);
        setFlowRevision((r) => r + 1);
        setFilePath(path);
        setValidation(null);
        setRunReport(null);
        clearRunStates();
        setStatus(`Loaded ${path}`);
      } catch (err) {
        if (generation !== loadGenerationRef.current) return;
        setStatus(err instanceof Error ? err.message : String(err));
      }
    },
    [deps, setEdges, setNodes, clearRunStates, applyMeta],
  );

  useEffect(() => {
    if (activePath) void loadWorkflow(activePath);
  }, [activePath, loadWorkflow]);

  useEffect(() => {
    const offDone = deps.subscribeWorkflowDone((report) => {
      setRunReport(report);
      setActiveRunId(null);
    });
    const offStarted = deps.subscribeWorkflowStarted?.((payload) => {
      setActiveRunId(payload.runId);
      clearRunStates();
      setRunReport({
        runId: payload.runId,
        rootRunId: payload.rootRunId,
        depth: 0,
        workflowId: payload.workflowId,
        status: "running",
        startedAt: new Date().toISOString(),
      });
    });
    const offStep = deps.subscribeWorkflowStep?.(applyWorkflowStep);
    return () => {
      offDone();
      offStarted?.();
      offStep?.();
    };
  }, [deps, applyWorkflowStep, clearRunStates]);

  const applyValidation = useCallback(
    async (def: WorkflowDefinition) => {
      const result = await deps.validate(def, {
        resolveSubworkflows: true,
      });
      setValidation(result);
      const nodeErrors = collectNodeValidationErrors(def, result.errors);
      setNodes((nds) => applyValidationToNodes(nds, nodeErrors));
      return result;
    },
    [deps, setNodes],
  );

  const currentDefinition = useCallback(() => {
    const draftName = nameInputRef.current?.value.trim();
    const resolvedMeta: WorkflowMeta = {
      ...meta,
      name: draftName || meta.name,
    };
    return {
      ...flowToDefinition(definition, nodes, edges),
      ...resolvedMeta,
    };
  }, [definition, nodes, edges, meta]);

  const handleSave = async () => {
    const def = currentDefinition();
    const path =
      filePath ??
      `${deps.workflowsFolder}/new-workflow.workflow.json`;

    try {
      await deps.saveWorkflow(path, def);
      setFilePath(path);
      setDefinition(def);
      applyMeta({
        name: def.name,
        id: def.id,
        description: def.description,
      });
      setStatus(`Saved ${path}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCancel = useCallback(() => {
    const target =
      activeRunId ??
      (runReport?.rootRunId && runReport.rootRunId !== "pending"
        ? runReport.rootRunId
        : null) ??
      (runReport?.runId && runReport.runId !== "pending" ? runReport.runId : null);
    if (!target) return;

    const cancelled = deps.cancel(target);
    if (!cancelled) {
      deps.notify?.("无法取消：运行已结束或未找到活动任务");
      return;
    }
    setStatusKind("running");
    setStatus("Cancelling…");
  }, [activeRunId, runReport, deps]);

  const handleValidate = async () => {
    const def = currentDefinition();
    setDefinition(def);
    const result = await applyValidation(def);
    setStatus(
      result.valid
        ? "Workflow is valid"
        : `Invalid: ${result.errors[0]?.message ?? "unknown"}`,
    );
  };

  const handleRun = async () => {
    const def = currentDefinition();
    setDefinition(def);

    let runPrompt = "";
    const inputPrompt = getUserInputPromptLabel(def);
    if (inputPrompt) {
      const text = await deps.promptUserInput({
        prompt: inputPrompt,
        placeholder: "输入问题后点击运行",
      });
      if (text === null) return;
      runPrompt = text;
    }

    const resolved = resolveWorkflowRunInputs({
      def,
      runPrompt,
      activeWikiId: deps.activeWikiId,
      wikiIds,
    });
    if (resolved.error) {
      setStatusKind("error");
      setStatus(resolved.error);
      deps.notify?.(resolved.error);
      return;
    }

    const result = await applyValidation(def);
    if (!result.valid) {
      const message = `Cannot run: ${result.errors[0]?.message ?? "validation failed"}`;
      setStatusKind("error");
      setStatus(message);
      deps.notify?.(message);
      return;
    }

    setStatusKind("running");
    setStatus("Running…");
    setRunReport({
      runId: "pending",
      rootRunId: "pending",
      depth: 0,
      workflowId: def.id,
      status: "running",
      startedAt: new Date().toISOString(),
    });
    clearRunStates();
    try {
      const report = await deps.run(def, resolved.inputs);
      setRunReport(report);
      if (report.status === "completed") {
        setStatusKind("info");
        setStatus(`Run ${report.status}`);
      } else {
        const message = report.error ?? `Run ${report.status}`;
        setStatusKind("error");
        setStatus(message);
        deps.notify?.(message);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatusKind("error");
      setStatus(message);
      deps.notify?.(message);
    }
  };

  const onConnect = useCallback(
    (connection: Connection) => {
      const id = createEdgeId(
        connection.source,
        connection.target,
        connection.sourceHandle ?? undefined,
      );
      setEdges((eds) => {
        const next = addEdge({ ...connection, id }, eds);
        setNodes((nds) => {
          syncDefinition(nds, next);
          return nds;
        });
        return next;
      });
    },
    [nodes, setEdges, syncDefinition],
  );

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    setSelectedNodeId(params.nodes[0]?.id ?? null);
  }, []);

  const onAddNode = (type: string) => {
    const position = { x: 120 + nodes.length * 24, y: 120 + nodes.length * 16 };
    const node = createNodeFromCatalog(
      type,
      position,
      nodes.map((entry) => entry.id),
    );
    setNodes((nds) => {
      const next = [...nds, node];
      syncDefinition(next, edges);
      return next;
    });
    setSelectedNodeId(node.id);
  };

  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    const type = event.dataTransfer.getData("application/wikiflow-node");
    if (!type || !reactFlowWrapper.current || !reactFlow.current) return;

    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const position = reactFlow.current.screenToFlowPosition({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    });
    const node = createNodeFromCatalog(
      type,
      position,
      nodes.map((entry) => entry.id),
    );
    setNodes((nds) => {
      const next = [...nds, node];
      syncDefinition(next, edges);
      return next;
    });
    setSelectedNodeId(node.id);
  };

  const onNodeConfigChange = (nodeId: string, config: Record<string, unknown>) => {
    setNodes((nds) => {
      const next = nds.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, config: { ...config } } }
          : n,
      );
      syncDefinition(next, edges);
      return next;
    });
  };

  const onNodeIdChange = (nodeId: string, draft: string): string | undefined => {
    const result = applyNodeIdChange(nodes, edges, nodeId, draft);
    if (result.error) {
      return result.error;
    }
    if (result.newId === nodeId) {
      return undefined;
    }

    setNodes(result.nodes);
    setEdges(result.edges);
    syncDefinition(result.nodes, result.edges);
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(result.newId);
    }
    return undefined;
  };

  const onDeleteNode = (nodeId: string) => {
    setNodes((nds) => {
      const nextNodes = nds.filter((n) => n.id !== nodeId);
      const nextEdges = edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
      setEdges(nextEdges);
      syncDefinition(nextNodes, nextEdges);
      return nextNodes;
    });
    setSelectedNodeId(null);
  };

  const onNodesDragStop = () => {
    syncDefinition(nodes, edges);
  };

  const selectedNodeRun = selectedNodeId
    ? nodeRunStates[selectedNodeId] ?? null
    : null;

  const displayPath =
    filePath ?? `${deps.workflowsFolder}/new-workflow.workflow.json`;

  const validationPill = validation
    ? validation.valid
      ? { kind: "valid" as const, text: "Workflow is valid" }
      : { kind: "invalid" as const, text: `${validation.errors.length} error(s)` }
    : null;

  return (
    <div className="ef-workflow-editor">
      <header className="ef-workflow-header">
        <div className="ef-workflow-header__logo">
          <WorkflowLogoIcon />
        </div>

        <div className="ef-workflow-header__title-block">
          <div className="ef-workflow-header__name-row">
            <input
              ref={nameInputRef}
              className="ef-workflow-header__name"
              value={meta.name}
              onChange={(e) => {
                const name = e.target.value;
                applyMeta({
                  ...meta,
                  name,
                  id: meta.id || slugify(name),
                });
                setDefinition((d) => ({ ...d, name, id: d.id || slugify(name) }));
              }}
              placeholder="Workflow name"
            />
            <button
              type="button"
              className="ef-workflow-header__name-edit"
              aria-label="Edit workflow name"
              onClick={() => nameInputRef.current?.focus()}
            >
              <PencilIcon />
            </button>
          </div>
          <div className="ef-workflow-header__meta">
            <span className="ef-workflow-header__path">{displayPath}</span>
            <select
              className="ef-workflow-header__picker"
              value={filePath ?? ""}
              onChange={(e) => {
                const path = e.target.value;
                if (path) void loadWorkflow(path);
              }}
              aria-label="Open workflow"
            >
              <option value="">Open…</option>
              {workflowFiles.map((path) => (
                <option key={path} value={path}>
                  {path}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="ef-workflow-header__spacer" />

        {status ? (
          <span
            className={`ef-workflow-header__status ef-workflow-header__status--${statusKind}`}
          >
            {status}
          </span>
        ) : validationPill ? (
          <div
            className={`ef-validation-pill ef-validation-pill--${validationPill.kind}`}
          >
            <span className="ef-validation-pill__dot" aria-hidden />
            <span>{validationPill.text}</span>
          </div>
        ) : null}

        <div className="ef-workflow-header__divider" aria-hidden />

        <div className="ef-workflow-header__actions">
          <button
            type="button"
            className="ef-btn ef-btn--ghost"
            disabled={!filePath}
            onClick={() => filePath && void loadWorkflow(filePath)}
          >
            <ReloadIcon />
            Reload
          </button>
          <button
            type="button"
            className="ef-btn ef-btn--ghost"
            onClick={() => void handleValidate()}
          >
            <ValidateIcon />
            Validate
          </button>
          <button type="button" className="ef-btn ef-btn--ghost" onClick={() => void handleSave()}>
            <SaveIcon />
            Save
          </button>
          {isWorkflowRunning ? (
            <button
              type="button"
              className="ef-btn ef-btn--ghost"
              onClick={handleCancel}
            >
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            className="ef-btn ef-btn--primary"
            disabled={isWorkflowRunning}
            onClick={() => void handleRun()}
          >
            <RunIcon />
            Run
          </button>
        </div>
      </header>

      <div className="ef-workflow-body">
        <NodePalette onAdd={onAddNode} />

        <div
          className={`ef-workflow-canvas${isWorkflowRunning ? " is-workflow-running" : ""}`}
          ref={reactFlowWrapper}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          <ReactFlow
            key={`${filePath ?? "new"}-${flowRevision}`}
            nodes={visualNodes}
            edges={visualEdges}
            onNodesChange={(changes) => {
              onNodesChange(changes);
            }}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            onNodeDragStop={onNodesDragStop}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{
              style: { stroke: "#b9bec9", strokeWidth: 2.5 },
            }}
            fitView
            onInit={(instance) => {
              reactFlow.current = instance;
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={22}
              size={1.1}
              color="#dcdfe6"
            />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
          <span className="ef-workflow-canvas__attribution">React Flow</span>
        </div>

        <div className="ef-workflow-sidebar">
          <NodeInspector
            node={selectedNode}
            nodes={nodes}
            edges={edges}
            workflowFiles={workflowFiles}
            wikiIds={wikiIds}
            nodeRun={selectedNodeRun}
            onChange={onNodeConfigChange}
            onNodeIdChange={onNodeIdChange}
            onDelete={onDeleteNode}
          />
          <RunTreePanel
            report={runReport}
            onCancel={() => handleCancel()}
          />
        </div>
      </div>

      <footer className="ef-workflow-statusbar">
        <span>{nodes.length} nodes</span>
        <span className="ef-workflow-statusbar__sep">·</span>
        <span>{edges.length} connections</span>
        {runReport ? (
          <>
            <span className="ef-workflow-statusbar__sep">·</span>
            <span
              className={
                runReport.status === "failed" || runReport.status === "cancelled"
                  ? "ef-workflow-statusbar__error"
                  : undefined
              }
            >
              Run {runReport.status}
              {runReport.error ? ` — ${runReport.error}` : ""}
            </span>
          </>
        ) : null}
        <div className="ef-workflow-statusbar__spacer" />
        <span className="ef-workflow-statusbar__status">
          <StatusCheckIcon />
          WikiFlow
        </span>
      </footer>
    </div>
  );
}

export function WorkflowEditor(props: WorkflowEditorProps) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner {...props} />
    </ReactFlowProvider>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "workflow";
}
