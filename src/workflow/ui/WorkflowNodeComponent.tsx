import type { CSSProperties } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NodeIcon } from "./node-icons";
import {
  getNodeCategoryClass,
  getNodeStatusKind,
  getNodeSubtitle,
  getNodeTheme,
  NODE_STATUS_LABEL,
} from "./node-theme";
import type { WorkflowNodeData } from "./workflow-adapter";
import type { NodeRunPhase } from "./run-visuals";
import { NodeRunOverlay } from "./NodeRunOverlay";

export function WorkflowNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as WorkflowNodeData;
  const isBranch = nodeData.nodeType === "branch.if";
  const runPhase = (nodeData.runPhase ?? "idle") as NodeRunPhase;
  const categoryClass = getNodeCategoryClass(nodeData.nodeType);
  const theme = getNodeTheme(nodeData.nodeType);
  const status = getNodeStatusKind(runPhase, nodeData.hasError);

  return (
    <div
      className={`ef-workflow-node ${categoryClass}${selected ? " is-selected" : ""}${
        nodeData.hasError ? " has-error" : ""
      }${runPhase !== "idle" ? ` is-run-${runPhase}` : ""}`}
      style={
        {
          "--ef-accent": theme.accent,
          "--ef-accent-soft": theme.soft,
        } as CSSProperties
      }
      title={nodeData.nodeType}
    >
      {runPhase === "running" ? <NodeRunOverlay /> : null}

      <Handle
        type="target"
        position={Position.Top}
        className="ef-handle ef-handle--target"
      />

      <div className="ef-workflow-node__main">
        <div className="ef-workflow-node__icon" aria-hidden>
          <NodeIcon nodeType={nodeData.nodeType} size={19} />
        </div>
        <div className="ef-workflow-node__text">
          <div className="ef-workflow-node__title">{nodeData.label}</div>
          <div className="ef-workflow-node__subtitle">
            {getNodeSubtitle(nodeData.nodeType)}
          </div>
        </div>
      </div>

      <div className="ef-workflow-node__footer">
        <span className={`ef-workflow-node__status ef-workflow-node__status--${status}`}>
          <span className="ef-workflow-node__status-dot" aria-hidden />
          {NODE_STATUS_LABEL[status]}
        </span>
        <span className="ef-workflow-node__badge">{theme.label}</span>
      </div>

      {nodeData.hasError && nodeData.errorMessages?.length ? (
        <span
          className="ef-workflow-node__error"
          title={nodeData.errorMessages.join("\n")}
        >
          !
        </span>
      ) : null}

      {isBranch ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            className="ef-handle ef-handle--source"
            style={{ left: "30%" }}
          />
          <span className="ef-handle-label ef-handle-label--true">true</span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className="ef-handle ef-handle--source"
            style={{ left: "70%" }}
          />
          <span className="ef-handle-label ef-handle-label--false">false</span>
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className="ef-handle ef-handle--source"
        />
      )}
    </div>
  );
}
