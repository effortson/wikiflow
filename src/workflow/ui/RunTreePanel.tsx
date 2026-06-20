import type { ReactElement } from "react";
import type { RunReport } from "@shared/types/workflow";
import { BigPlayIcon, RunPanelIcon } from "./workflow-ui-icons";

interface RunTreePanelProps {
  report: RunReport | null;
  onCancel?: () => void;
}

export function RunTreePanel({ report, onCancel }: RunTreePanelProps) {
  return (
    <div className="ef-run-section">
      <div className="ef-run-section__head">
        <RunPanelIcon />
        <span>Run</span>
      </div>
      {report ? (
        <div className="ef-run-tree">{renderRunNode(report, onCancel)}</div>
      ) : (
        <div className="ef-run-empty">
          <div className="ef-run-empty__icon">
            <BigPlayIcon />
          </div>
          <div className="ef-run-empty__title">No runs yet</div>
          <div className="ef-run-empty__hint">
            Click <span className="ef-run-empty__accent">Run</span> to execute this
            workflow.
          </div>
        </div>
      )}
    </div>
  );
}

function renderRunNode(
  report: RunReport,
  onCancel?: () => void,
  depth = 0,
): ReactElement {
  const statusClass = `ef-run-status ef-run-status--${report.status}`;
  return (
    <div key={report.runId} className="ef-run-node" style={{ marginLeft: depth * 12 }}>
      <div className="ef-run-node__header">
        <span className={statusClass}>{report.status}</span>
        <strong>{report.workflowId}</strong>
        <span className="ef-muted">depth {report.depth}</span>
        {report.status === "running" && onCancel && depth === 0 ? (
          <button
            type="button"
            className="ef-btn ef-btn--ghost ef-btn--small"
            onClick={onCancel}
          >
            Cancel
          </button>
        ) : null}
      </div>
      {report.error ? <div className="ef-run-error">{report.error}</div> : null}
      {report.childRuns?.map((child) => renderRunNode(child, onCancel, depth + 1))}
    </div>
  );
}
