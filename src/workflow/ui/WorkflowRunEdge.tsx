import { memo } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

export type EdgeRunState = "running" | "completed" | "failed" | "idle";

function strokeForRunState(runState: EdgeRunState): string {
  switch (runState) {
    case "failed":
      return "#ef4444";
    case "completed":
      return "#22c55e";
    case "running":
      return "#60a5fa";
    default:
      return "#b9bec9";
  }
}

function WorkflowRunEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  data,
}: EdgeProps) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const runState = (data?.runState as EdgeRunState | undefined) ?? "idle";
  const running = runState === "running";

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: strokeForRunState(runState),
          strokeWidth: running ? 3 : 2.5,
        }}
      />
      {running ? (
        <g className="ef-edge-runners" aria-hidden>
          <path
            d={path}
            fill="none"
            stroke="rgba(59, 130, 246, 0.2)"
            strokeWidth={7}
            strokeLinecap="round"
          />
          <circle r={4.5} className="ef-edge-runner-dot ef-edge-runner-dot--primary">
            <animateMotion dur="1.1s" repeatCount="indefinite" path={path} />
          </circle>
          <circle r={3} className="ef-edge-runner-dot ef-edge-runner-dot--secondary">
            <animateMotion
              dur="1.1s"
              repeatCount="indefinite"
              path={path}
              begin="0.36s"
            />
          </circle>
        </g>
      ) : null}
    </>
  );
}

export const WorkflowRunEdge = memo(WorkflowRunEdgeComponent);
