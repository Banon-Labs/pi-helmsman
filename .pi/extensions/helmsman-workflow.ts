import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import {
	createDefaultWorkflowState,
	formatWorkflowStatus,
	restoreWorkflowState,
	updateWorkflowMode,
	updateWorkflowPlanGoal,
	WORKFLOW_STATE_CUSTOM_TYPE,
} from "./helmsman-workflow/state.js";
import type { WorkflowMode, WorkflowState } from "./helmsman-workflow/types.js";

const CUSTOM_MESSAGE_TYPE = "helmsman-workflow";
const STATUS_KEY = "helmsman-workflow";
const PLAN_COMMAND = "plan";
const STEP_COMMAND = "step";
const RUN_COMMAND = "run";
const MODE_COMMAND = "mode";
const STATUS_COMMAND = "status";

function updateFooterStatus(ctx: ExtensionCommandContext | { ui: ExtensionCommandContext["ui"] }, state: WorkflowState): void {
	ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg(state.mode === "plan" ? "warning" : "accent", `wf:${state.mode}`));
}

function persistState(pi: ExtensionAPI, state: WorkflowState): void {
	pi.appendEntry(WORKFLOW_STATE_CUSTOM_TYPE, {
		mode: state.mode,
		plan: state.plan,
	});
}

function parseModeArg(args: string): WorkflowMode | undefined {
	const value = args.trim().toLowerCase();
	if (value === "plan" || value === "build") return value;
	return undefined;
}

function publishStatus(pi: ExtensionAPI, state: WorkflowState): void {
	pi.sendMessage({
		customType: CUSTOM_MESSAGE_TYPE,
		content: formatWorkflowStatus(state),
		details: state,
		display: true,
	});
}

export default function helmsmanWorkflowExtension(pi: ExtensionAPI) {
	let workflowState = createDefaultWorkflowState();

	pi.on("session_start", async (_event, ctx) => {
		workflowState = restoreWorkflowState(
			ctx.sessionManager.getBranch() as Array<{ type: string; customType?: string; data?: unknown }>,
		);
		updateFooterStatus(ctx as ExtensionCommandContext, workflowState);
	});

	pi.registerCommand(PLAN_COMMAND, {
		description: "Enter plan mode and capture a placeholder planning goal scaffold",
		handler: async (args, ctx) => {
			workflowState = updateWorkflowMode(workflowState, "plan");
			if (args.trim()) {
				workflowState = updateWorkflowPlanGoal(workflowState, args);
			}
			persistState(pi, workflowState);
			updateFooterStatus(ctx, workflowState);
			ctx.ui.notify("Plan mode active. Planner flow scaffolding is ready; detailed planning behavior lands in later slices.", "info");
			publishStatus(pi, workflowState);
		},
	});

	pi.registerCommand(STEP_COMMAND, {
		description: "Placeholder step execution command for the Helmsman workflow scaffold",
		handler: async (_args, ctx) => {
			ctx.ui.notify("/step scaffold is registered, but execution behavior is not implemented yet.", "info");
			publishStatus(pi, workflowState);
		},
	});

	pi.registerCommand(RUN_COMMAND, {
		description: "Placeholder phase execution command for the Helmsman workflow scaffold",
		handler: async (_args, ctx) => {
			ctx.ui.notify("/run scaffold is registered, but execution behavior is not implemented yet.", "info");
			publishStatus(pi, workflowState);
		},
	});

	pi.registerCommand(MODE_COMMAND, {
		description: "Show or update Helmsman workflow mode (plan|build)",
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			if (!trimmed) {
				ctx.ui.notify(`Current workflow mode: ${workflowState.mode}`, "info");
				publishStatus(pi, workflowState);
				return;
			}

			const nextMode = parseModeArg(trimmed);
			if (!nextMode) {
				ctx.ui.notify("Usage: /mode [plan|build]", "warning");
				return;
			}

			workflowState = updateWorkflowMode(workflowState, nextMode);
			persistState(pi, workflowState);
			updateFooterStatus(ctx, workflowState);
			ctx.ui.notify(`Workflow mode set to ${nextMode}`, "info");
			publishStatus(pi, workflowState);
		},
	});

	pi.registerCommand(STATUS_COMMAND, {
		description: "Show current Helmsman workflow mode and placeholder plan scaffold",
		handler: async (_args, ctx) => {
			updateFooterStatus(ctx, workflowState);
			ctx.ui.notify(`Workflow mode: ${workflowState.mode}`, "info");
			publishStatus(pi, workflowState);
		},
	});
}
