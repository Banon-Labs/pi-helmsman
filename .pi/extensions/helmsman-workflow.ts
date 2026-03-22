import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { buildClarifiedGoal, getClarificationQuestion, shouldClarifyGoal } from "./helmsman-workflow/clarify.js";
import { normalizeRequestedPlanGoal, shouldPromptForPlanGoal } from "./helmsman-workflow/command-goal.js";
import { parseWorkflowPlanFromText } from "./helmsman-workflow/parse-plan.js";
import { describePlannerRuntime } from "./helmsman-workflow/runtime.js";
import {
	createDefaultWorkflowState,
	formatWorkflowStatus,
	mergeWorkflowPlanState,
	restoreWorkflowState,
	updateWorkflowMode,
	updateWorkflowPlanGoal,
	updateWorkflowPlanScaffold,
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
const PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "fetch_reference", "questionnaire"];
const BUILD_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "edit", "write", "fetch_reference"];

function updateFooterStatus(ctx: ExtensionCommandContext | ExtensionContext, state: WorkflowState): void {
	ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg(state.mode === "plan" ? "warning" : "accent", `wf:${state.mode}`));
}

function persistState(pi: ExtensionAPI, state: WorkflowState): void {
	pi.appendEntry(WORKFLOW_STATE_CUSTOM_TYPE, {
		mode: state.mode,
		plan: state.plan,
	});
}

function syncActiveTools(pi: ExtensionAPI, mode: WorkflowMode): void {
	pi.setActiveTools(mode === "plan" ? PLAN_MODE_TOOLS : BUILD_MODE_TOOLS);
}

function parseModeArg(args: string): WorkflowMode | undefined {
	const value = args.trim().toLowerCase();
	if (value === "plan" || value === "build") return value;
	return undefined;
}

function publishStatus(pi: ExtensionAPI, state: WorkflowState, hasModel: boolean): void {
	pi.sendMessage({
		customType: CUSTOM_MESSAGE_TYPE,
		content: formatWorkflowStatus(state, describePlannerRuntime(hasModel)),
		details: state,
		display: true,
	});
}

function isSlashCommand(text: string): boolean {
	return text.trimStart().startsWith("/");
}

function isAssistantMessage(message: unknown): message is AssistantMessage {
	return !!message && typeof message === "object" && (message as { role?: string }).role === "assistant";
}

function getAssistantText(message: AssistantMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

async function resolvePlanGoal(text: string, ctx: ExtensionContext | ExtensionCommandContext): Promise<string> {
	const trimmed = text.trim();
	if (!trimmed || !ctx.hasUI || !shouldClarifyGoal(trimmed)) return trimmed;
	const clarification = await ctx.ui.input("Helmsman clarification", getClarificationQuestion(trimmed));
	return buildClarifiedGoal(trimmed, clarification ?? "");
}

export default function helmsmanWorkflowExtension(pi: ExtensionAPI) {
	let workflowState = createDefaultWorkflowState();

	pi.on("session_start", async (_event, ctx) => {
		workflowState = restoreWorkflowState(
			ctx.sessionManager.getBranch() as Array<{ type: string; customType?: string; data?: unknown }>,
		);
		syncActiveTools(pi, workflowState.mode);
		updateFooterStatus(ctx, workflowState);
	});

	pi.on("model_select", async (event, ctx) => {
		ctx.ui.notify(describePlannerRuntime(Boolean(event.model)), event.model ? "info" : "warning");
		updateFooterStatus(ctx, workflowState);
	});

	pi.on("input", async (event, ctx) => {
		if (workflowState.mode !== "plan") return { action: "continue" as const };
		if (!event.text.trim() || isSlashCommand(event.text)) return { action: "continue" as const };
		const resolvedGoal = await resolvePlanGoal(event.text, ctx);
		workflowState = updateWorkflowPlanScaffold(workflowState, resolvedGoal);
		persistState(pi, workflowState);
		if (resolvedGoal !== event.text.trim()) {
			return { action: "transform" as const, text: resolvedGoal, images: event.images };
		}
		return { action: "continue" as const };
	});

	pi.on("before_agent_start", async (event) => {
		if (workflowState.mode !== "plan") return;
		if (!event.prompt.trim() || isSlashCommand(event.prompt)) return;
		return {
			message: {
				customType: CUSTOM_MESSAGE_TYPE,
				content: `[HELMSMAN PLAN MODE]\nTreat the current user request as a planning task, not an execution task. Ask clarifying questions with the questionnaire tool if key requirements are missing. Prefer read-only repo exploration with read, grep, find, ls, bash, and fetch_reference. Produce a concise draft plan with explicit sections for Goal, Constraints, Assumptions, Target Files, Current Phase, Plan, Verification Notes, and Approval State. Keep each phase to 3-5 steps and leave approval state as draft.`,
				display: false,
			},
		};
	});

	pi.on("agent_end", async (event, ctx) => {
		if (workflowState.mode !== "plan") return;
		const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
		if (!lastAssistant) return;
		const parsedPlan = parseWorkflowPlanFromText(getAssistantText(lastAssistant));
		if (!parsedPlan) return;
		workflowState = {
			...workflowState,
			plan: mergeWorkflowPlanState(workflowState.plan, parsedPlan),
		};
		persistState(pi, workflowState);
		updateFooterStatus(ctx, workflowState);
	});

	pi.registerCommand(PLAN_COMMAND, {
		description: "Enter plan mode and seed a draft planning scaffold from the provided goal",
		handler: async (args, ctx) => {
			workflowState = updateWorkflowMode(workflowState, "plan");
			let requestedGoal = normalizeRequestedPlanGoal(args, workflowState.plan.goal);
			if (ctx.hasUI && shouldPromptForPlanGoal(args, workflowState.plan.goal)) {
				requestedGoal = (await ctx.ui.input("Helmsman planning goal", "What should this plan accomplish?"))?.trim() ?? "";
			}
			const resolvedGoal = requestedGoal ? await resolvePlanGoal(requestedGoal, ctx) : workflowState.plan.goal;
			workflowState = resolvedGoal
				? updateWorkflowPlanScaffold(workflowState, resolvedGoal)
				: updateWorkflowPlanGoal(workflowState, workflowState.plan.goal);
			persistState(pi, workflowState);
			syncActiveTools(pi, workflowState.mode);
			updateFooterStatus(ctx, workflowState);
			ctx.ui.notify("Plan mode active. Natural-language requests now steer toward structured planning.", "info");
			publishStatus(pi, workflowState, Boolean(ctx.model));
		},
	});

	pi.registerCommand(STEP_COMMAND, {
		description: "Placeholder step execution command for the Helmsman workflow scaffold",
		handler: async (_args, ctx) => {
			ctx.ui.notify("/step scaffold is registered, but execution behavior is not implemented yet.", "info");
			publishStatus(pi, workflowState, Boolean(ctx.model));
		},
	});

	pi.registerCommand(RUN_COMMAND, {
		description: "Placeholder phase execution command for the Helmsman workflow scaffold",
		handler: async (_args, ctx) => {
			ctx.ui.notify("/run scaffold is registered, but execution behavior is not implemented yet.", "info");
			publishStatus(pi, workflowState, Boolean(ctx.model));
		},
	});

	pi.registerCommand(MODE_COMMAND, {
		description: "Show or update Helmsman workflow mode (plan|build)",
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			if (!trimmed) {
				ctx.ui.notify(`Current workflow mode: ${workflowState.mode}`, "info");
				publishStatus(pi, workflowState, Boolean(ctx.model));
				return;
			}

			const nextMode = parseModeArg(trimmed);
			if (!nextMode) {
				ctx.ui.notify("Usage: /mode [plan|build]", "warning");
				return;
			}

			workflowState = updateWorkflowMode(workflowState, nextMode);
			persistState(pi, workflowState);
			syncActiveTools(pi, workflowState.mode);
			updateFooterStatus(ctx, workflowState);
			ctx.ui.notify(`Workflow mode set to ${nextMode}`, "info");
			publishStatus(pi, workflowState, Boolean(ctx.model));
		},
	});

	pi.registerCommand(STATUS_COMMAND, {
		description: "Show current Helmsman workflow mode and draft plan scaffold",
		handler: async (_args, ctx) => {
			updateFooterStatus(ctx, workflowState);
			ctx.ui.notify(`Workflow mode: ${workflowState.mode}`, "info");
			publishStatus(pi, workflowState, Boolean(ctx.model));
		},
	});
}
