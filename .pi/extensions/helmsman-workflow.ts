import type { AssistantMessage, TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { buildBeadsDraftOutput, parseBeadsDraftArgs } from "./helmsman-workflow/beads.js";
import { buildClarifiedGoal, getClarificationQuestion, shouldClarifyGoal } from "./helmsman-workflow/clarify.js";
import { normalizeRequestedPlanGoal, shouldPromptForPlanGoal } from "./helmsman-workflow/command-goal.js";
import {
	buildWorkflowHandoffPrompt,
	buildWorkflowHandoffSessionName,
} from "./helmsman-workflow/handoff.js";
import { renderWorkflowPlanDraft } from "./helmsman-workflow/draft.js";
import {
	advanceWorkflowPlanForRun,
	advanceWorkflowPlanForStep,
	getExecutionBlockReason,
	shouldReplanAfterExecutionBlock,
} from "./helmsman-workflow/execution.js";
import { parseWorkflowPlanFromText } from "./helmsman-workflow/parse-plan.js";
import { describePlannerRuntime } from "./helmsman-workflow/runtime.js";
import {
	getBashSafetyPrompt,
	getPlanModeBashBlockReason,
	getProtectedPathPrompt,
	getUnexpectedFileSpreadReason,
} from "./helmsman-workflow/safety.js";
import {
	createDefaultWorkflowState,
	formatWorkflowStatus,
	mergeWorkflowPlanState,
	restoreWorkflowState,
	updateWorkflowApprovalState,
	updateWorkflowMode,
	updateWorkflowPlanGoal,
	updateWorkflowPlanScaffold,
	WORKFLOW_STATE_CUSTOM_TYPE,
} from "./helmsman-workflow/state.js";
import { detectWorkflowTtsBackend, speakWorkflowMilestone, type WorkflowTtsBackend } from "./helmsman-workflow/tts.js";
import type { WorkflowApprovalState, WorkflowMode, WorkflowState } from "./helmsman-workflow/types.js";

const CUSTOM_MESSAGE_TYPE = "helmsman-workflow";
const STATUS_KEY = "helmsman-workflow";
const PLAN_COMMAND = "plan";
const PLAN_DRAFT_COMMAND = "plan-draft";
const BEADS_DRAFT_COMMAND = "beads-draft";
const STEP_COMMAND = "step";
const RUN_COMMAND = "run";
const APPROVE_COMMAND = "approve";
const HANDOFF_COMMAND = "handoff";
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

function parseApprovalArg(args: string): WorkflowApprovalState | undefined {
	const value = args.trim().toLowerCase();
	if (!value || value === "approved" || value === "approve") return "approved";
	if (value === "draft") return "draft";
	return undefined;
}

async function confirmOrBlock(
	ctx: ExtensionContext,
	prompt: { title: string; message: string; reason: string },
	backend?: WorkflowTtsBackend,
): Promise<{ block: true; reason: string } | undefined> {
	if (!ctx.hasUI) {
		speakWorkflowMilestone("safety-block", backend);
		return { block: true, reason: `${prompt.reason} Blocked because no interactive confirmation UI is available.` };
	}
	const confirmed = await ctx.ui.confirm(prompt.title, prompt.message);
	if (!confirmed) {
		speakWorkflowMilestone("safety-block", backend);
		return { block: true, reason: `${prompt.reason} Blocked by user.` };
	}
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
	let ttsBackend: WorkflowTtsBackend | undefined;

	pi.on("session_start", async (_event, ctx) => {
		workflowState = restoreWorkflowState(
			ctx.sessionManager.getBranch() as Array<{ type: string; customType?: string; data?: unknown }>,
		);
		ttsBackend = detectWorkflowTtsBackend();
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

	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName === "bash") {
			const command = String((event.input as { command?: string }).command ?? "");
			const planModeBlockReason = workflowState.mode === "plan" ? getPlanModeBashBlockReason(command) : undefined;
			if (planModeBlockReason) {
				speakWorkflowMilestone("safety-block", ttsBackend);
				return { block: true, reason: planModeBlockReason };
			}
			const bashPrompt = getBashSafetyPrompt(command);
			if (bashPrompt) return confirmOrBlock(ctx, bashPrompt, ttsBackend);
		}

		if (event.toolName === "edit" || event.toolName === "write") {
			const path = String((event.input as { path?: string }).path ?? "");
			const unexpectedFileSpreadReason =
				workflowState.mode === "build" && workflowState.plan.approvalState === "approved"
					? getUnexpectedFileSpreadReason(path, workflowState.plan.targetFiles)
					: undefined;
			if (unexpectedFileSpreadReason) {
				workflowState = updateWorkflowApprovalState(updateWorkflowMode(workflowState, "plan"), "draft");
				persistState(pi, workflowState);
				syncActiveTools(pi, workflowState.mode);
				updateFooterStatus(ctx, workflowState);
				ctx.ui.notify(unexpectedFileSpreadReason, "warning");
				speakWorkflowMilestone("safety-block", ttsBackend);
				publishStatus(pi, workflowState, Boolean(ctx.model));
				return { block: true, reason: unexpectedFileSpreadReason };
			}
			const protectedPathPrompt = getProtectedPathPrompt(path);
			if (protectedPathPrompt) return confirmOrBlock(ctx, protectedPathPrompt, ttsBackend);
		}
	});

	pi.on("user_bash", async (event, ctx) => {
		const planModeBlockReason = workflowState.mode === "plan" ? getPlanModeBashBlockReason(event.command) : undefined;
		if (planModeBlockReason) {
			speakWorkflowMilestone("safety-block", ttsBackend);
			return {
				result: {
					output: planModeBlockReason,
					exitCode: 1,
					cancelled: false,
					truncated: false,
				},
			};
		}

		const bashPrompt = getBashSafetyPrompt(event.command);
		if (!bashPrompt) return;
		if (!ctx.hasUI) {
			speakWorkflowMilestone("safety-block", ttsBackend);
			return {
				result: {
					output: `${bashPrompt.reason} Blocked because no interactive confirmation UI is available.`,
					exitCode: 1,
					cancelled: false,
					truncated: false,
				},
			};
		}
		const confirmed = await ctx.ui.confirm(bashPrompt.title, bashPrompt.message);
		if (confirmed) return;
		speakWorkflowMilestone("safety-block", ttsBackend);
		return {
			result: {
				output: `${bashPrompt.reason} Blocked by user.`,
				exitCode: 1,
				cancelled: false,
				truncated: false,
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
		speakWorkflowMilestone("plan-ready", ttsBackend);
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
			speakWorkflowMilestone("plan-ready", ttsBackend);
			publishStatus(pi, workflowState, Boolean(ctx.model));
		},
	});

	pi.registerCommand(PLAN_DRAFT_COMMAND, {
		description: "Show the providerless structured planner draft using the model-output contract",
		handler: async (_args, ctx) => {
			ctx.ui.notify("Showing structured planner draft.", "info");
			pi.sendMessage({
				customType: `${CUSTOM_MESSAGE_TYPE}-draft`,
				content: renderWorkflowPlanDraft(workflowState.plan),
				details: workflowState.plan,
				display: true,
			});
		},
	});

	pi.registerCommand(BEADS_DRAFT_COMMAND, {
		description: "Show the Beads-facing draft preview and JSON derived from the current Helmsman plan",
		handler: async (args, ctx) => {
			const draft = buildBeadsDraftOutput(workflowState.plan, parseBeadsDraftArgs(args));
			ctx.ui.notify("Showing Beads draft preview and JSON.", "info");
			pi.sendMessage({
				customType: `${CUSTOM_MESSAGE_TYPE}-beads-draft`,
				content: `${draft.previewText}\n\nJSON:\n${draft.json}`,
				details: draft,
				display: true,
			});
		},
	});

	pi.registerCommand(STEP_COMMAND, {
		description: "Advance one approved Helmsman step at a time",
		handler: async (_args, ctx) => {
			const blockedReason = getExecutionBlockReason(workflowState.plan, "step");
			if (blockedReason) {
				if (shouldReplanAfterExecutionBlock(workflowState.plan, "step")) {
					workflowState = updateWorkflowApprovalState(updateWorkflowMode(workflowState, "plan"), "draft");
					persistState(pi, workflowState);
					syncActiveTools(pi, workflowState.mode);
					updateFooterStatus(ctx, workflowState);
					ctx.ui.notify(`${blockedReason} Returning to plan mode for replanning.`, "warning");
					speakWorkflowMilestone("safety-block", ttsBackend);
					publishStatus(pi, workflowState, Boolean(ctx.model));
					return;
				}
				ctx.ui.notify(blockedReason, "warning");
				if (blockedReason.includes("approved plan")) speakWorkflowMilestone("approval-required", ttsBackend);
				publishStatus(pi, workflowState, Boolean(ctx.model));
				return;
			}

			const result = advanceWorkflowPlanForStep(workflowState.plan);
			workflowState = {
				...workflowState,
				mode: "build",
				plan: result.plan,
			};
			persistState(pi, workflowState);
			syncActiveTools(pi, workflowState.mode);
			updateFooterStatus(ctx, workflowState);
			ctx.ui.notify(result.summary, "info");
			if (result.summary.includes("Completed phase")) speakWorkflowMilestone("phase-complete", ttsBackend);
			publishStatus(pi, workflowState, Boolean(ctx.model));
		},
	});

	pi.registerCommand(RUN_COMMAND, {
		description: "Advance the current approved Helmsman phase",
		handler: async (_args, ctx) => {
			const blockedReason = getExecutionBlockReason(workflowState.plan, "run");
			if (blockedReason) {
				if (shouldReplanAfterExecutionBlock(workflowState.plan, "run")) {
					workflowState = updateWorkflowApprovalState(updateWorkflowMode(workflowState, "plan"), "draft");
					persistState(pi, workflowState);
					syncActiveTools(pi, workflowState.mode);
					updateFooterStatus(ctx, workflowState);
					ctx.ui.notify(`${blockedReason} Returning to plan mode for replanning.`, "warning");
					speakWorkflowMilestone("safety-block", ttsBackend);
					publishStatus(pi, workflowState, Boolean(ctx.model));
					return;
				}
				ctx.ui.notify(blockedReason, "warning");
				if (blockedReason.includes("approved plan")) speakWorkflowMilestone("approval-required", ttsBackend);
				publishStatus(pi, workflowState, Boolean(ctx.model));
				return;
			}

			const result = advanceWorkflowPlanForRun(workflowState.plan);
			workflowState = {
				...workflowState,
				mode: "build",
				plan: result.plan,
			};
			persistState(pi, workflowState);
			syncActiveTools(pi, workflowState.mode);
			updateFooterStatus(ctx, workflowState);
			ctx.ui.notify(result.summary, "info");
			if (result.summary.includes("Completed the final phase")) speakWorkflowMilestone("run-complete", ttsBackend);
			else if (result.summary.includes("Completed phase")) speakWorkflowMilestone("phase-complete", ttsBackend);
			publishStatus(pi, workflowState, Boolean(ctx.model));
		},
	});

	pi.registerCommand(APPROVE_COMMAND, {
		description: "Update Helmsman plan approval state (approved|draft)",
		handler: async (args, ctx) => {
			const nextApproval = parseApprovalArg(args);
			if (!nextApproval) {
				ctx.ui.notify("Usage: /approve [approved|draft]", "warning");
				return;
			}

			workflowState = updateWorkflowApprovalState(workflowState, nextApproval);
			persistState(pi, workflowState);
			updateFooterStatus(ctx, workflowState);
			ctx.ui.notify(`Plan approval set to ${nextApproval}`, "info");
			publishStatus(pi, workflowState, Boolean(ctx.model));
		},
	});

	pi.registerCommand(HANDOFF_COMMAND, {
		description: "Create a fresh Pi-native session that carries Helmsman state forward for handoff/resume",
		handler: async (args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/handoff requires interactive mode", "warning");
				return;
			}

			const parentSession = ctx.sessionManager.getSessionFile();
			const promptDraft = buildWorkflowHandoffPrompt(workflowState, args);
			const sessionName = buildWorkflowHandoffSessionName(workflowState, args);
			const result = await ctx.newSession({
				parentSession,
				setup: async (sessionManager) => {
					sessionManager.appendCustomEntry(WORKFLOW_STATE_CUSTOM_TYPE, {
						mode: workflowState.mode,
						plan: workflowState.plan,
					});
					sessionManager.appendSessionInfo(sessionName);
				},
			});
			if (result.cancelled) {
				ctx.ui.notify("Handoff cancelled", "info");
				return;
			}

			ctx.ui.setEditorText(promptDraft);
			updateFooterStatus(ctx, workflowState);
			ctx.ui.notify(`Native handoff ready in session \"${sessionName}\". Review the seeded prompt, then submit when ready.`, "info");
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
