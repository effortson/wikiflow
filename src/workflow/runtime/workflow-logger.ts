import type { WorkflowStepEvent } from "@shared/types/workflow-step";

const PREFIX = "[WikiFlow:workflow]";

export function logWorkflowStep(step: WorkflowStepEvent): void {
  const label = `${step.nodeId} (${step.nodeType})`;
  const timing =
    step.durationMs !== undefined ? ` ${step.durationMs}ms` : "";

  if (step.phase === "started") {
    console.groupCollapsed(`${PREFIX} ▶ ${label} started`);
    if (step.inputs && Object.keys(step.inputs).length > 0) {
      console.log("inputs", step.inputs);
    }
    if (step.config && Object.keys(step.config).length > 0) {
      console.log("config", step.config);
    }
    console.groupEnd();
    return;
  }

  if (step.phase === "completed") {
    console.groupCollapsed(`${PREFIX} ✓ ${label} completed${timing}`);
    if (step.outputs && Object.keys(step.outputs).length > 0) {
      console.log("outputs", step.outputs);
    }
    console.groupEnd();
    return;
  }

  console.group(`${PREFIX} ✗ ${label} failed${timing}`);
  if (step.error) console.error(step.error);
  if (step.inputs && Object.keys(step.inputs).length > 0) {
    console.log("inputs", step.inputs);
  }
  if (step.config && Object.keys(step.config).length > 0) {
    console.log("config", step.config);
  }
  console.groupEnd();
}
