import { complete, type AssistantMessage, type TextContent, type UserMessage } from "@mariozechner/pi-ai";
import { BorderedLoader, type ExtensionAPI, type ExtensionCommandContext, type ExtensionContext } from "@mariozechner/pi-coding-agent";
import { buildBeadsDraftOutput, parseBeadsDraftArgs } from "./helmsman-workflow/beads.js";
import { assessDirtyWorktree, formatDirtyWorktreeAssessment } from "./helmsman-context/dirty.js";
import { findRepoRoot } from "./helmsman-context/filesystem.js";
import {
	buildClarifiedGoal,
	getClarificationChoices,
	getClarificationQuestion,
	shouldClarifyGoal,
} from "./helmsman-workflow/clarify.js";
import { normalizeRequestedPlanGoal, shouldPromptForPlanGoal } from "./helmsman-workflow/command-goal.js";
import { resolveForcedChoiceSelection, type ForcedChoiceResult } from "./helmsman-workflow/choices.js";
import { buildWorkflowHandoffPrompt, buildWorkflowHandoffSessionName } from "./helmsman-workflow/handoff.js";
import { renderWorkflowPlanDraft } from "./helmsman-workflow/draft.js";
import {
	buildApprovalRequiredNotice,
	buildCollaborativeReplanNotice,
	buildPlanModeActivationNotice,
	buildPlanModeSystemPrompt,
	buildRiskyStepEvidencePolicyPrompt,
	buildStrictStructuredPlanPrompt,
	buildVerificationFailureNotice,
	getApprovalRequiredChoices,
	getCollaborativeReplanChoices,
	getVerificationFailureChoices,
} from "./helmsman-workflow/voice.js";
import {
	advanceWorkflowPlanForRun,
	advanceWorkflowPlanForStep,
	buildVerificationFailureNote,
	getExecutionBlockReason,
	getWorkflowInputTransform,
	getVerificationFailureReason,
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
	parsePreHandoffReview,
	resetWorkflowStateForFreshPlanning,
	restoreWorkflowState,
	sanitizeWorkflowPlanState,
	shouldRunPreHandoffReview,
	updateWorkflowApprovalState,
	updateWorkflowMode,
	updateWorkflowPlanGoal,
	updateWorkflowPlanScaffold,
	WORKFLOW_STATE_CUSTOM_TYPE,
} from "./helmsman-workflow/state.js";
import {
	detectWorkflowTtsBackend,
	formatWorkflowTtsRuntimeStatus,
	getWorkflowTtsRuntimeStatus,
	speakWorkflowMilestone,
	type WorkflowTtsBackend,
} from "./helmsman-workflow/tts.js";
import type {
	WorkflowApprovalState,
	WorkflowMode,
	WorkflowSelfReview,
	WorkflowState,
} from "./helmsman-workflow/types.js";

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
const PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "fetch_reference", "fetch_web", "search_web", "questionnaire"];
const BUILD_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "edit", "write", "fetch_reference", "fetch_web", "search_web"];

function updateFooterStatus(ctx: ExtensionCommandContext | ExtensionContext, state: WorkflowState): void {
	const tone = state.mode === "plan" ? "warning" : state.mode === "off" ? "success" : "accent";
	ctx.ui.setStatus(STATUS_KEY, ctx.ui.theme.fg(tone, `wf:${state.mode}`));
}

function persistState(pi: ExtensionAPI, state: WorkflowState): void {
	pi.appendEntry(WORKFLOW_STATE_CUSTOM_TYPE, {
		mode: state.mode,
		plan: state.plan,
	});
}

function syncActiveTools(pi: ExtensionAPI, mode: WorkflowMode): void {
	if (mode === "plan") {
		pi.setActiveTools(PLAN_MODE_TOOLS);
		return;
	}
	if (mode === "build") {
		pi.setActiveTools(BUILD_MODE_TOOLS);
		return;
	}
	pi.setActiveTools(pi.getAllTools().map((tool) => tool.name));
}

function parseModeArg(args: string): WorkflowMode | undefined {
	const value = args.trim().toLowerCase();
	if (value === "plan" || value === "build" || value === "off") return value;
	return undefined;
}

function parseApprovalArg(args: string): WorkflowApprovalState | undefined {
	const value = args.trim().toLowerCase();
	if (!value || value === "approved" || value === "approve") return "approved";
	if (value === "draft") return "draft";
	return undefined;
}

async function selectWithOptionalOther(
	ctx: ExtensionContext | ExtensionCommandContext,
	title: string,
	message: string,
	choices: readonly [string, string, string],
	otherPrompt: string,
): Promise<ForcedChoiceResult | undefined> {
	if (!ctx.hasUI) return undefined;
	const choice = await ctx.ui.select(message, [...choices]);
	const result = resolveForcedChoiceSelection(
		choice,
		choices,
		choice === choices[2] ? await ctx.ui.input(title, otherPrompt) : undefined,
	);
	if (result?.kind === "other-empty") {
		ctx.ui.notify("Helmsman kept the current draft because the Something else follow-up was left blank.", "warning");
		return undefined;
	}
	return result;
}

function showWorkflowPlanDraft(pi: ExtensionAPI, plan: WorkflowState["plan"]): void {
	pi.sendMessage({
		customType: `${CUSTOM_MESSAGE_TYPE}-draft`,
		content: renderWorkflowPlanDraft(plan),
		details: plan,
		display: true,
	});
}

function speakWorkflowMilestoneWithWarning(
	ctx: ExtensionContext | ExtensionCommandContext,
	milestone: "plan-ready" | "approval-required" | "phase-complete" | "run-complete" | "safety-block",
	backend?: WorkflowTtsBackend,
): void {
	const voiceResult = speakWorkflowMilestone(milestone, backend);
	if (voiceResult.error) {
		ctx.ui.notify(`Voice notify warning: ${voiceResult.error}`, "warning");
	}
}

async function confirmOrBlock(
	ctx: ExtensionContext,
	prompt: { title: string; message: string; reason: string },
	backend?: WorkflowTtsBackend,
): Promise<{ block: true; reason: string } | undefined> {
	if (!ctx.hasUI) {
		speakWorkflowMilestoneWithWarning(ctx, "safety-block", backend);
		return { block: true, reason: `${prompt.reason} Blocked because no interactive confirmation UI is available.` };
	}
	const confirmed = await ctx.ui.confirm(prompt.title, prompt.message);
	if (!confirmed) {
		speakWorkflowMilestoneWithWarning(ctx, "safety-block", backend);
		return { block: true, reason: `${prompt.reason} Blocked by user.` };
	}
	return undefined;
}

function buildWorkflowStatusContent(state: WorkflowState, hasModel: boolean): string {
	const workflowStatus = formatWorkflowStatus(state, describePlannerRuntime(hasModel));
	const voiceStatus = formatWorkflowTtsRuntimeStatus(getWorkflowTtsRuntimeStatus());
	return `${workflowStatus}\n\n[Voice]\n${voiceStatus}`;
}

function publishStatus(pi: ExtensionAPI, state: WorkflowState, hasModel: boolean): void {
	pi.sendMessage({
		customType: CUSTOM_MESSAGE_TYPE,
		content: buildWorkflowStatusContent(state, hasModel),
		details: state,
		display: true,
	});
}

async function getDirtyWorktreeDetails(
	pi: ExtensionAPI,
	ctx: ExtensionContext | ExtensionCommandContext,
	targetFiles: string[],
): Promise<string | undefined> {
	const repoRoot = findRepoRoot(ctx.cwd);
	if (!repoRoot) return undefined;
	const result = await pi.exec("git", ["status", "--short", "--untracked-files=all"], { cwd: repoRoot });
	const assessment = assessDirtyWorktree(result.stdout, targetFiles);
	if (assessment.entries.length === 0) return undefined;
	return formatDirtyWorktreeAssessment(assessment);
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
	const clarificationChoices = getClarificationChoices(trimmed);
	const clarification = await selectWithOptionalOther(
		ctx,
		"Helmsman clarification",
		"How should Helmsman narrow this plan before drafting it?",
		clarificationChoices,
		getClarificationQuestion(trimmed),
	);
	if (!clarification) return trimmed;
	if (clarification.kind === "other") {
		return buildClarifiedGoal(trimmed, clarification.text);
	}
	return buildClarifiedGoal(trimmed, clarification.kind === "first" ? clarificationChoices[0] : clarificationChoices[1]);
}

const PLAN_COMMAND_SYSTEM_PROMPT = [
	buildPlanModeSystemPrompt(),
	"Base the plan on the user's stated goal and any scaffold context provided.",
	"If target files are uncertain, leave them empty instead of guessing from slash-commands or abstract nouns.",
	buildStrictStructuredPlanPrompt(),
].join("\n");

const REVIEW_COMMAND_SYSTEM_PROMPT = [
	"[HELMSMAN SELF-REVIEW]",
	"You are evaluating whether Helmsman should hand work back to the user or keep working on the current task.",
	"Be skeptical of premature completion claims.",
	"Weigh confidence, residual risk, validation completeness, and brittle/failure-path gaps.",
	"If the work looks under-validated or likely incomplete, choose continue.",
	buildRiskyStepEvidencePolicyPrompt(),
	"When risky or order-sensitive steps are involved, require raw evidence first, then a separate cross-check, and only then any decision or administrative action.",
	"Do not accept summaries alone when concrete RTK output, direct parser/draft inspection, or tmux smoke evidence should be visible.",
	"Return only the following sections:",
	"Trigger: <short description>",
	"Confidence: low|medium|high",
	"Risk: low|medium|high",
	"Validation: sufficient|insufficient",
	"Decision: continue|handoff",
	"Reasoning: <short paragraph>",
	"Follow-up:",
	"- <item or none>",
].join("\n");

function formatPreHandoffReview(review: WorkflowSelfReview): string {
	return [
		"Helmsman self-review:",
		`- Trigger: ${review.trigger}`,
		`- Confidence: ${review.confidence}`,
		`- Risk: ${review.risk}`,
		`- Validation: ${review.validation}`,
		`- Decision: ${review.decision}`,
		`- Reasoning: ${review.reasoning}`,
		"- Follow-up:",
		...(review.followUp.length > 0 ? review.followUp.map((item) => `  - ${item}`) : ["  - none"]),
	].join("\n");
}

async function generatePlanDraft(
	ctx: ExtensionCommandContext,
	goal: string,
	workflowState: WorkflowState,
): Promise<string | null> {
	if (!ctx.hasUI || !ctx.model) return null;
	const scaffold = renderWorkflowPlanDraft(workflowState.plan);
	return ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
		const loader = new BorderedLoader(tui, theme, `Planning with ${ctx.model!.id}...`);
		loader.onAbort = () => done(null);

		const doGenerate = async () => {
			const apiKey = await ctx.modelRegistry.getApiKey(ctx.model!);
			const userMessage: UserMessage = {
				role: "user",
				content: [{
					type: "text",
					text: [
						`User goal:\n${goal}`,
						"",
						"Current scaffold:",
						scaffold,
					].join("\n"),
				}],
				timestamp: Date.now(),
			};

			const response = await complete(
				ctx.model!,
				{ systemPrompt: PLAN_COMMAND_SYSTEM_PROMPT, messages: [userMessage] },
				{ apiKey, signal: loader.signal },
			);
			if (response.stopReason === "aborted") return null;
			return response.content
				.filter((block): block is { type: "text"; text: string } => block.type === "text")
				.map((block) => block.text)
				.join("\n")
				.trim();
		};

		doGenerate().then(done).catch(() => done(null));
		return loader;
	});
}

async function generatePreHandoffReview(
	ctx: ExtensionContext,
	assistantText: string,
	workflowState: WorkflowState,
): Promise<string | null> {
	if (!ctx.hasUI || !ctx.model) return null;
	return ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
		const loader = new BorderedLoader(tui, theme, `Running Helmsman self-review with ${ctx.model!.id}...`);
		loader.onAbort = () => done(null);

		const doGenerate = async () => {
			const apiKey = await ctx.modelRegistry.getApiKey(ctx.model!);
			const userMessage: UserMessage = {
				role: "user",
				content: [{
					type: "text",
					text: [
						`Workflow goal: ${workflowState.plan.goal || "none"}`,
						`Workflow mode: ${workflowState.mode}`,
						`Approval: ${workflowState.plan.approvalState}`,
						`Current position: phase ${workflowState.plan.currentPhase ?? "none"}, step ${workflowState.plan.currentStep ?? "none"}`,
						"",
						"Verification notes:",
						workflowState.plan.verificationNotes.length > 0 ? workflowState.plan.verificationNotes.map((note) => `- ${note}`).join("\n") : "- none",
						"",
						"Assistant response to review:",
						assistantText,
					].join("\n"),
				}],
				timestamp: Date.now(),
			};
			const response = await complete(
				ctx.model!,
				{ systemPrompt: REVIEW_COMMAND_SYSTEM_PROMPT, messages: [userMessage] },
				{ apiKey, signal: loader.signal },
			);
			if (response.stopReason === "aborted") return null;
			return response.content
				.filter((block): block is { type: "text"; text: string } => block.type === "text")
				.map((block) => block.text)
				.join("\n")
				.trim();
		};

		doGenerate().then(done).catch(() => done(null));
		return loader;
	});
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
		if (!event.text.trim() || isSlashCommand(event.text)) return { action: "continue" as const };
		if (workflowState.mode === "build") {
			const transformed = getWorkflowInputTransform(workflowState.mode, event.text);
			if (transformed) {
				return { action: "transform" as const, text: transformed, images: event.images };
			}
			return { action: "continue" as const };
		}
		if (workflowState.mode !== "plan") return { action: "continue" as const };
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
				content: buildPlanModeSystemPrompt(),
				display: false,
			},
		};
	});

	pi.on("tool_call", async (event, ctx) => {
		if (workflowState.mode === "off") return;
		if (event.toolName === "bash") {
			const command = String((event.input as { command?: string }).command ?? "");
			const planModeBlockReason = workflowState.mode === "plan" ? getPlanModeBashBlockReason(command) : undefined;
			if (planModeBlockReason) {
				speakWorkflowMilestoneWithWarning(ctx, "safety-block", ttsBackend);
				return { block: true, reason: planModeBlockReason };
			}
			const bashPrompt = getBashSafetyPrompt(command, {
				mode: workflowState.mode,
				targetFiles: workflowState.plan.targetFiles,
			});
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
				speakWorkflowMilestoneWithWarning(ctx, "safety-block", ttsBackend);
				publishStatus(pi, workflowState, Boolean(ctx.model));
				return { block: true, reason: unexpectedFileSpreadReason };
			}
			const protectedPathPrompt = getProtectedPathPrompt(path);
			if (protectedPathPrompt) return confirmOrBlock(ctx, protectedPathPrompt, ttsBackend);
		}
	});

	pi.on("user_bash", async (event, ctx) => {
		if (workflowState.mode === "off") return;
		const planModeBlockReason = workflowState.mode === "plan" ? getPlanModeBashBlockReason(event.command) : undefined;
		if (planModeBlockReason) {
			speakWorkflowMilestoneWithWarning(ctx, "safety-block", ttsBackend);
			return {
				result: {
					output: planModeBlockReason,
					exitCode: 1,
					cancelled: false,
					truncated: false,
				},
			};
		}

		const bashPrompt = getBashSafetyPrompt(event.command, {
			mode: workflowState.mode,
			targetFiles: workflowState.plan.targetFiles,
		});
		if (!bashPrompt) return;
		if (!ctx.hasUI) {
			speakWorkflowMilestoneWithWarning(ctx, "safety-block", ttsBackend);
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
		speakWorkflowMilestoneWithWarning(ctx, "safety-block", ttsBackend);
		return {
			result: {
				output: `${bashPrompt.reason} Blocked by user.`,
				exitCode: 1,
				cancelled: false,
				truncated: false,
			},
		};
	});

	pi.on("tool_result", async (event, ctx) => {
		if (event.toolName !== "bash" || !event.isError) return;
		if (workflowState.mode !== "build" || workflowState.plan.approvalState !== "approved") return;
		const command = String(event.input.command ?? "");
		const verificationFailureReason = getVerificationFailureReason(command);
		if (!verificationFailureReason) return;
		const verificationNote = buildVerificationFailureNote(command);
		workflowState = {
			...updateWorkflowApprovalState(updateWorkflowMode(workflowState, "plan"), "draft"),
			plan: {
				...workflowState.plan,
				approvalState: "draft",
				verificationNotes: [...workflowState.plan.verificationNotes, verificationNote],
			},
		};
		persistState(pi, workflowState);
		syncActiveTools(pi, workflowState.mode);
		updateFooterStatus(ctx, workflowState);
		ctx.ui.notify(buildVerificationFailureNotice(verificationFailureReason), "warning");
		speakWorkflowMilestoneWithWarning(ctx, "safety-block", ttsBackend);
		publishStatus(pi, workflowState, Boolean(ctx.model));
		const verificationChoice = await selectWithOptionalOther(
			ctx,
			"Helmsman verification follow-up",
			buildVerificationFailureNotice(verificationFailureReason),
			getVerificationFailureChoices(),
			"What should Helmsman change before retrying verification?",
		);
		if (verificationChoice?.kind === "first" || verificationChoice?.kind === "second") {
			showWorkflowPlanDraft(pi, workflowState.plan);
		} else if (verificationChoice?.kind === "other" && verificationChoice.text) {
			pi.sendUserMessage(verificationChoice.text);
		}
	});

	pi.on("agent_end", async (event, ctx) => {
		const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
		if (!lastAssistant) return;
		const assistantText = getAssistantText(lastAssistant);

		if (workflowState.mode === "plan") {
			const parsedPlan = parseWorkflowPlanFromText(assistantText);
			if (!parsedPlan) return;
			workflowState = {
				...workflowState,
				plan: mergeWorkflowPlanState(workflowState.plan, parsedPlan),
			};
			persistState(pi, workflowState);
			updateFooterStatus(ctx, workflowState);
			speakWorkflowMilestoneWithWarning(ctx, "plan-ready", ttsBackend);
			return;
		}

		if (workflowState.mode !== "build" || !shouldRunPreHandoffReview(assistantText)) return;
		const reviewText = await generatePreHandoffReview(ctx, assistantText, workflowState);
		if (!reviewText) return;
		const parsedReview = parsePreHandoffReview(reviewText);
		if (!parsedReview) {
			pi.sendMessage({
				customType: `${CUSTOM_MESSAGE_TYPE}-review-error`,
				content: reviewText,
				details: { goal: workflowState.plan.goal },
				display: true,
			});
			ctx.ui.notify("Helmsman self-review ran, but the review output was not structured enough to act on.", "warning");
			return;
		}

		if (parsedReview.decision === "continue") {
			workflowState = {
				...updateWorkflowApprovalState(updateWorkflowMode(workflowState, "plan"), "draft"),
				plan: {
					...workflowState.plan,
					approvalState: "draft",
					verificationNotes: [
						...workflowState.plan.verificationNotes,
						`Self-review kept work active: ${parsedReview.reasoning}`,
					],
				},
			};
			persistState(pi, workflowState);
			syncActiveTools(pi, workflowState.mode);
			updateFooterStatus(ctx, workflowState);
			ctx.ui.notify("Helmsman self-review found more work to do, so I returned to plan mode instead of handing off.", "warning");
			speakWorkflowMilestoneWithWarning(ctx, "safety-block", ttsBackend);
			publishStatus(pi, workflowState, Boolean(ctx.model));
		}

		pi.sendMessage({
			customType: `${CUSTOM_MESSAGE_TYPE}-review`,
			content: formatPreHandoffReview(parsedReview),
			details: parsedReview,
			display: true,
		});
	});

	pi.registerCommand(PLAN_COMMAND, {
		description: "Enter plan mode and ask the planner model for a structured draft plan",
		handler: async (args, ctx) => {
			const nextRequestedGoal = normalizeRequestedPlanGoal(args, workflowState.plan.goal);
			workflowState = workflowState.plan.approvalState === "approved"
				? resetWorkflowStateForFreshPlanning(nextRequestedGoal)
				: updateWorkflowMode(workflowState, "plan");
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
			ctx.ui.notify(buildPlanModeActivationNotice(), "info");

			if (!ctx.model) {
				ctx.ui.notify("Planner model unavailable. Helmsman kept the scaffold, but /plan could not run the planner. Select a model and try again.", "warning");
				publishStatus(pi, workflowState, false);
				return;
			}

			const generatedPlan = resolvedGoal ? await generatePlanDraft(ctx, resolvedGoal, workflowState) : null;
			if (!generatedPlan) {
				ctx.ui.notify("Planner run cancelled or failed before Helmsman could draft the plan.", "warning");
				publishStatus(pi, workflowState, true);
				return;
			}

			const parsedPlan = parseWorkflowPlanFromText(generatedPlan);
			if (!parsedPlan) {
				pi.sendMessage({
					customType: `${CUSTOM_MESSAGE_TYPE}-planner-error`,
					content: generatedPlan,
					details: { goal: resolvedGoal },
					display: true,
				});
				ctx.ui.notify("Planner responded, but the output was not in Helmsman's structured plan format.", "warning");
				publishStatus(pi, workflowState, true);
				return;
			}

			workflowState = {
				...workflowState,
				plan: sanitizeWorkflowPlanState(mergeWorkflowPlanState(workflowState.plan, parsedPlan)),
			};
			persistState(pi, workflowState);
			updateFooterStatus(ctx, workflowState);
			speakWorkflowMilestoneWithWarning(ctx, "plan-ready", ttsBackend);
			pi.sendMessage({
				customType: `${CUSTOM_MESSAGE_TYPE}-planner`,
				content: generatedPlan,
				details: workflowState.plan,
				display: true,
			});
		},
	});

	pi.registerCommand(PLAN_DRAFT_COMMAND, {
		description: "Show the providerless structured planner draft using the model-output contract",
		handler: async (_args, ctx) => {
			ctx.ui.notify("Showing structured planner draft.", "info");
			showWorkflowPlanDraft(pi, workflowState.plan);
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
			workflowState = resetWorkflowStateForFreshPlanning();
			persistState(pi, workflowState);
			syncActiveTools(pi, workflowState.mode);
			updateFooterStatus(ctx, workflowState);
			publishStatus(pi, workflowState, Boolean(ctx.model));
			ctx.ui.notify("Helmsman reset the active approved plan after Beads draft handoff so later planning starts fresh.", "info");
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
					ctx.ui.notify(buildCollaborativeReplanNotice(blockedReason), "warning");
					speakWorkflowMilestoneWithWarning(ctx, "safety-block", ttsBackend);
					publishStatus(pi, workflowState, Boolean(ctx.model));
					const replanChoice = await selectWithOptionalOther(
						ctx,
						"Helmsman replanning",
						buildCollaborativeReplanNotice(blockedReason),
						getCollaborativeReplanChoices(),
						"How should the plan change before Helmsman continues?",
					);
					if (replanChoice?.kind === "first") showWorkflowPlanDraft(pi, workflowState.plan);
					else if (replanChoice?.kind === "other" && replanChoice.text) pi.sendUserMessage(replanChoice.text);
					return;
				}
				ctx.ui.notify(buildApprovalRequiredNotice(blockedReason), "warning");
				if (blockedReason.includes("approved plan")) speakWorkflowMilestoneWithWarning(ctx, "approval-required", ttsBackend);
				publishStatus(pi, workflowState, Boolean(ctx.model));
				const approvalChoice = await selectWithOptionalOther(
					ctx,
					"Helmsman approval",
					buildApprovalRequiredNotice(blockedReason),
					getApprovalRequiredChoices(),
					"What should Helmsman change before execution continues?",
				);
				if (!approvalChoice) return;
				if (approvalChoice.kind === "first") {
					workflowState = updateWorkflowApprovalState(workflowState, "approved");
					persistState(pi, workflowState);
					updateFooterStatus(ctx, workflowState);
					ctx.ui.notify("Plan approved. Continuing with /step.", "info");
					publishStatus(pi, workflowState, Boolean(ctx.model));
				} else {
					workflowState = updateWorkflowApprovalState(updateWorkflowMode(workflowState, "plan"), "draft");
					persistState(pi, workflowState);
					syncActiveTools(pi, workflowState.mode);
					updateFooterStatus(ctx, workflowState);
					publishStatus(pi, workflowState, Boolean(ctx.model));
					if (approvalChoice.kind === "second") showWorkflowPlanDraft(pi, workflowState.plan);
					else if (approvalChoice.text) pi.sendUserMessage(approvalChoice.text);
					return;
				}
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
			if (result.summary.includes("Completed phase")) speakWorkflowMilestoneWithWarning(ctx, "phase-complete", ttsBackend);
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
					ctx.ui.notify(buildCollaborativeReplanNotice(blockedReason), "warning");
					speakWorkflowMilestoneWithWarning(ctx, "safety-block", ttsBackend);
					publishStatus(pi, workflowState, Boolean(ctx.model));
					const replanChoice = await selectWithOptionalOther(
						ctx,
						"Helmsman replanning",
						buildCollaborativeReplanNotice(blockedReason),
						getCollaborativeReplanChoices(),
						"How should the plan change before Helmsman continues?",
					);
					if (replanChoice?.kind === "first") showWorkflowPlanDraft(pi, workflowState.plan);
					else if (replanChoice?.kind === "other" && replanChoice.text) pi.sendUserMessage(replanChoice.text);
					return;
				}
				ctx.ui.notify(buildApprovalRequiredNotice(blockedReason), "warning");
				if (blockedReason.includes("approved plan")) speakWorkflowMilestoneWithWarning(ctx, "approval-required", ttsBackend);
				publishStatus(pi, workflowState, Boolean(ctx.model));
				const approvalChoice = await selectWithOptionalOther(
					ctx,
					"Helmsman approval",
					buildApprovalRequiredNotice(blockedReason),
					getApprovalRequiredChoices(),
					"What should Helmsman change before execution continues?",
				);
				if (!approvalChoice) return;
				if (approvalChoice.kind === "first") {
					workflowState = updateWorkflowApprovalState(workflowState, "approved");
					persistState(pi, workflowState);
					updateFooterStatus(ctx, workflowState);
					ctx.ui.notify("Plan approved. Continuing with /run.", "info");
					publishStatus(pi, workflowState, Boolean(ctx.model));
				} else {
					workflowState = updateWorkflowApprovalState(updateWorkflowMode(workflowState, "plan"), "draft");
					persistState(pi, workflowState);
					syncActiveTools(pi, workflowState.mode);
					updateFooterStatus(ctx, workflowState);
					publishStatus(pi, workflowState, Boolean(ctx.model));
					if (approvalChoice.kind === "second") showWorkflowPlanDraft(pi, workflowState.plan);
					else if (approvalChoice.text) pi.sendUserMessage(approvalChoice.text);
					return;
				}
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
			if (result.summary.includes("Completed the final phase")) speakWorkflowMilestoneWithWarning(ctx, "run-complete", ttsBackend);
			else if (result.summary.includes("Completed phase")) speakWorkflowMilestoneWithWarning(ctx, "phase-complete", ttsBackend);
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
			const dirtyWorktreeDetails = await getDirtyWorktreeDetails(pi, ctx, workflowState.plan.targetFiles);
			const promptDraft = buildWorkflowHandoffPrompt(workflowState, args, dirtyWorktreeDetails);
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
		description: "Show or update Helmsman workflow mode (plan|build|off)",
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			if (!trimmed) {
				ctx.ui.notify(`Current workflow mode: ${workflowState.mode}`, "info");
				publishStatus(pi, workflowState, Boolean(ctx.model));
				return;
			}

			const nextMode = parseModeArg(trimmed);
			if (!nextMode) {
				ctx.ui.notify("Usage: /mode [plan|build|off]", "warning");
				return;
			}

			workflowState = nextMode === "plan" && workflowState.plan.approvalState === "approved"
				? resetWorkflowStateForFreshPlanning()
				: updateWorkflowMode(workflowState, nextMode);
			persistState(pi, workflowState);
			syncActiveTools(pi, workflowState.mode);
			updateFooterStatus(ctx, workflowState);
			ctx.ui.notify(`Workflow mode set to ${nextMode}`, "info");
			publishStatus(pi, workflowState, Boolean(ctx.model));
		},
	});

	pi.registerCommand(STATUS_COMMAND, {
		description: "Show current Helmsman workflow mode, draft plan scaffold, and voice clip runtime status",
		handler: async (_args, ctx) => {
			updateFooterStatus(ctx, workflowState);
			ctx.ui.notify(`Workflow mode: ${workflowState.mode}`, "info");
			publishStatus(pi, workflowState, Boolean(ctx.model));
			const dirtyWorktreeDetails = await getDirtyWorktreeDetails(pi, ctx, workflowState.plan.targetFiles);
			if (dirtyWorktreeDetails) {
				pi.sendMessage({
					customType: `${CUSTOM_MESSAGE_TYPE}-dirty-worktree`,
					content: `Dirty worktree:\n${dirtyWorktreeDetails}`,
					details: { dirtyWorktreeDetails },
					display: true,
				});
			}
		},
	});
}
