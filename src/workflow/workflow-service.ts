import type { PluginSettings } from "../core/config/settings";
import type { CoreServices } from "../core/core-services";
import type { WikiService } from "../wiki/service";
import type {
  RunOptions,
  RunReport,
  ValidateOptions,
  WorkflowDefinition,
  WorkflowService,
} from "@shared/types/workflow";
import type { ValidationResult } from "@shared/types/validation";
import { createBuiltinNodeRegistry } from "./registry/builtin-nodes";
import { NodeRegistry } from "./registry/node-registry";
import { validateWorkflow, type WorkflowIndexEntry } from "./schema/validator";
import {
  createWorkflowContext,
  type WorkflowServices,
} from "./runtime/context";
import { executeWorkflow } from "./runtime/executor";
import { runSubworkflow } from "./runtime/nested-runner";
import type { WorkflowStepEvent } from "@shared/types/workflow-step";
import { cleanupWorkflowRuns } from "./runtime/run-cleanup";
import { RunStore } from "./runtime/run-store";
import { logWorkflowStep } from "./runtime/workflow-logger";
import { WorkflowLoader } from "./service";

export interface WorkflowServiceContext {
  core: CoreServices;
  wiki: WikiService;
  getSettings: () => PluginSettings;
  notice?: (message: string) => void;
}

interface ActiveRun {
  controller: AbortController;
  rootRunId: string;
  parentRunId?: string;
  childRunIds: Set<string>;
  cancelJob?: () => void;
}

let runCounter = 0;

export class EnterpriseWorkflowService implements WorkflowService {
  private loader: WorkflowLoader;
  private runStore: RunStore;
  private registry: NodeRegistry;
  private services: WorkflowServices;
  private activeRuns = new Map<string, ActiveRun>();
  private rootRunSemaphore: { active: number; queue: (() => void)[] };

  constructor(private ctx: WorkflowServiceContext) {
    this.loader = new WorkflowLoader(ctx.core.vault);
    this.runStore = new RunStore(ctx.core.vault);
    this.services = {
      llm: ctx.core.llm,
      wiki: ctx.wiki,
      vault: ctx.core.vault,
      jobs: ctx.core.jobs,
      backup: ctx.core.backup,
      workflow: this,
    };

    const self = this;
    this.registry = createBuiltinNodeRegistry({
      getSettings: ctx.getSettings,
      notice: ctx.notice,
      runSubworkflow: (parentCtx, config) =>
        runSubworkflow(parentCtx, config, self.nestedRunnerDeps()),
    });

    this.rootRunSemaphore = { active: 0, queue: [] };
  }

  load(definitionPath: string): Promise<WorkflowDefinition> {
    return this.loader.load(definitionPath);
  }

  validate(
    def: WorkflowDefinition,
    options?: ValidateOptions,
  ): Promise<ValidationResult> {
    return validateWorkflow(def, this.validatorDeps(), options);
  }

  async run(
    def: WorkflowDefinition,
    inputs: Record<string, unknown> = {},
    options: RunOptions = {},
  ): Promise<RunReport> {
    const depth = options.depth ?? 0;
    const isRoot = depth === 0;

    if (isRoot) {
      const validation = await this.validate(def, { resolveSubworkflows: true });
      if (!validation.valid) {
        throw new Error(
          validation.errors.map((e) => e.message).join("; ") ||
            "Workflow validation failed",
        );
      }
      await this.acquireRootSlot();
    }

    // The root concurrency slot is acquired above; everything below is wrapped
    // so the slot (and the activeRuns entry) is always released, even if setup
    // throws before the run's own try/finally is reached.
    let runId: string | undefined;
    try {
      runId = this.createRunId();
      const parentActive = options.parentRunId
        ? this.activeRuns.get(options.parentRunId)
        : undefined;
      const rootRunId = isRoot ? runId : (parentActive?.rootRunId ?? runId);

      const controller = new AbortController();

      if (parentActive) {
        parentActive.childRunIds.add(runId);
        const onParentAbort = () => controller.abort();
        parentActive.controller.signal.addEventListener("abort", onParentAbort);
        controller.signal.addEventListener("abort", () => {
          parentActive.controller.signal.removeEventListener("abort", onParentAbort);
        });
      }

      this.activeRuns.set(runId, {
        controller,
        rootRunId,
        parentRunId: options.parentRunId,
        childRunIds: new Set(),
      });

      if (isRoot) {
        this.ctx.core.events.publish("workflow:started", {
          runId,
          workflowId: def.id,
          rootRunId,
        });
        console.log(
          `[WikiFlow:workflow] Run started ${def.id} (${runId})`,
        );
      }

      const onStep = (step: WorkflowStepEvent) => {
        logWorkflowStep(step);
        this.ctx.core.events.publish("workflow:step", step);
      };

      const workflowCtx = createWorkflowContext({
        runId,
        rootRunId,
        parentRunId: options.parentRunId,
        depth,
        workflowId: def.id,
        inheritedVariables: options.inheritedVariables,
        wikiId: inputs.wikiId as string | undefined,
        signal: controller.signal,
        services: this.services,
        onStep,
      });

      const startedAt = new Date().toISOString();
      let report: RunReport;

      const handle = this.ctx.core.jobs.enqueue(
        "workflow-run",
        async (signal) => {
          if (signal.aborted) throw new Error("Workflow run cancelled");

          const { outputs, childRuns } = await executeWorkflow(
            def,
            workflowCtx,
            this.registry,
            {
              initialVariables: { ...inputs, ...options.inheritedVariables },
              skipTriggers: depth > 0,
            },
          );

          return { outputs, childRuns };
        },
        {
          rootRunId,
          parentJobId: options.parentRunId,
          wikiId: inputs.wikiId as string | undefined,
        },
      );

      controller.signal.addEventListener("abort", () => handle.cancel());

      const active = this.activeRuns.get(runId);
      if (active) {
        active.cancelJob = () => handle.cancel();
      }

      try {
        const result = await handle.result;
        report = {
          runId,
          rootRunId,
          parentRunId: options.parentRunId,
          depth,
          workflowId: def.id,
          status: "completed",
          childRuns: result.childRuns,
          outputs: result.outputs,
          startedAt,
          finishedAt: new Date().toISOString(),
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const cancelled =
          controller.signal.aborted ||
          handle.job.status === "cancelled" ||
          message.toLowerCase().includes("cancelled");
        report = {
          runId,
          rootRunId,
          parentRunId: options.parentRunId,
          depth,
          workflowId: def.id,
          status: cancelled ? "cancelled" : "failed",
          error: err instanceof Error ? err.message : String(err),
          startedAt,
          finishedAt: new Date().toISOString(),
        };
      }

      await this.runStore.saveReport(report);

      if (isRoot) {
        this.ctx.core.events.publish("workflow:done", report);
        console.log(
          `[WikiFlow:workflow] Run ${report.status} ${def.id} (${runId})`,
          report.error ? { error: report.error } : { outputs: report.outputs },
        );
      } else if (options.parentRunId) {
        this.ctx.core.events.publish("workflow:child-done", {
          rootRunId,
          parentRunId: options.parentRunId,
          report,
        });
      }

      return report;
    } finally {
      if (runId) this.activeRuns.delete(runId);
      if (isRoot) {
        this.releaseRootSlot();
        void cleanupWorkflowRuns(
          this.runStore,
          this.ctx.getSettings(),
          (id) => this.runStore.readRootReport(id),
        );
      }
    }
  }

  cancel(runId: string): boolean {
    const resolved = this.resolveActiveRunEntry(runId);
    if (!resolved) return false;

    const { active } = resolved;
    active.controller.abort();
    active.cancelJob?.();
    for (const childId of active.childRunIds) {
      this.cancel(childId);
    }
    return true;
  }

  private resolveActiveRunEntry(
    runId: string,
  ): { id: string; active: ActiveRun } | undefined {
    const direct = this.activeRuns.get(runId);
    if (direct) return { id: runId, active: direct };

    // Resolve by rootRunId (e.g. cancelling a root cancels its tree). The
    // exact-key case is already covered by the direct lookup above.
    for (const [id, active] of this.activeRuns) {
      if (active.rootRunId === runId) {
        return { id, active };
      }
    }

    return undefined;
  }

  listActiveRunIds(): string[] {
    return [...this.activeRuns.keys()];
  }

  async listWorkflows(): Promise<WorkflowIndexEntry[]> {
    return this.validatorDeps().listWorkflows();
  }

  async resolveWorkflowRef(ref: string): Promise<string | null> {
    return this.validatorDeps().resolveWorkflowRef(ref);
  }

  private createRunId(): string {
    return `run-${Date.now()}-${++runCounter}`;
  }

  private nestedRunnerDeps() {
    return {
      getSettings: () => this.ctx.getSettings(),
      services: this.services,
      registry: this.registry,
      loadDefinition: (path: string) => this.load(path),
      resolveWorkflowRef: (ref: string) => this.resolveWorkflowRef(ref),
      validateDefinition: (
        def: WorkflowDefinition,
        options?: ValidateOptions,
      ) => this.validate(def, options),
      saveRunReport: (report: RunReport) => this.runStore.saveReport(report),
      onChildDone: (parentRunId: string, report: RunReport) => {
        this.ctx.core.events.publish("workflow:child-done", {
          rootRunId: report.rootRunId,
          parentRunId,
          report,
        });
      },
      createRunId: () => this.createRunId(),
    };
  }

  private validatorDeps() {
    const settings = this.ctx.getSettings();
    const workflowsFolder = settings.workflowsFolder;

    const listWorkflows = async (): Promise<WorkflowIndexEntry[]> => {
      const paths = this.ctx.core.vault
        .listFolder(workflowsFolder)
        .filter((p) => p.endsWith(".workflow.json"));
      const entries: WorkflowIndexEntry[] = [];
      for (const path of paths) {
        try {
          const def = await this.load(path);
          entries.push({ path, def });
        } catch {
          // skip invalid files
        }
      }
      return entries;
    };

    return {
      registry: this.registry,
      listWorkflows,
      resolveWorkflowRef: async (ref: string): Promise<string | null> => {
        if (ref.endsWith(".workflow.json")) {
          const path = this.ctx.core.vault.normalize(ref);
          if (await this.ctx.core.vault.exists(path)) return path;
          const nested = `${workflowsFolder}/${ref}`;
          if (await this.ctx.core.vault.exists(nested)) return nested;
          return null;
        }

        const all = await listWorkflows();
        const matches = all.filter((e) => e.def.id === ref);
        if (matches.length === 1) return matches[0].path;
        return null;
      },
      loadDefinition: (path: string) => this.load(path),
    };
  }

  private async acquireRootSlot(): Promise<void> {
    const max = this.ctx.getSettings().maxConcurrentWorkflowRuns;
    if (this.rootRunSemaphore.active < max) {
      this.rootRunSemaphore.active++;
      return;
    }

    await new Promise<void>((resolve) => {
      this.rootRunSemaphore.queue.push(() => {
        this.rootRunSemaphore.active++;
        resolve();
      });
    });
  }

  private releaseRootSlot(): void {
    this.rootRunSemaphore.active = Math.max(
      0,
      this.rootRunSemaphore.active - 1,
    );
    const next = this.rootRunSemaphore.queue.shift();
    next?.();
  }
}
