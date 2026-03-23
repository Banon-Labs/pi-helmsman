import type {
	CustomStateEntryLike,
	ParsedWorkflowPlanResult,
	WorkflowApprovalState,
	WorkflowMode,
	WorkflowPlanState,
	WorkflowSelfReview,
	WorkflowState,
} from "./types";
import { buildPlanScaffoldFromGoal, buildReadOnlyExplorationCommands } from "./planner";

export const WORKFLOW_STATE_CUSTOM_TYPE = "helmsman-workflow-state";

export function createDefaultWorkflowState(): WorkflowState {
	return {
		mode: "plan",
		plan: {
			goal: "",
			currentPhase: null,
			currentStep: null,
			targetFiles: [],
			approvalState: "draft",
			constraints: [],
			assumptions: [],
			verificationNotes: [],
			explorationCommands: [],
			phases: [],
		},
	};
}

export function restoreWorkflowState(entries: CustomStateEntryLike[]): WorkflowState {
	const defaults = createDefaultWorkflowState();
	const latest = [...entries]
		.reverse()
		.find((entry) => entry.type === "custom" && entry.customType === WORKFLOW_STATE_CUSTOM_TYPE);

	if (!latest?.data) return defaults;

	return {
		mode: latest.data.mode ?? defaults.mode,
		plan: {
			goal: latest.data.plan?.goal ?? defaults.plan.goal,
			currentPhase: latest.data.plan?.currentPhase ?? defaults.plan.currentPhase,
			currentStep: latest.data.plan?.currentStep ?? defaults.plan.currentStep,
			targetFiles: latest.data.plan?.targetFiles ?? defaults.plan.targetFiles,
			approvalState: latest.data.plan?.approvalState ?? defaults.plan.approvalState,
			constraints: latest.data.plan?.constraints ?? defaults.plan.constraints,
			assumptions: latest.data.plan?.assumptions ?? defaults.plan.assumptions,
			verificationNotes: latest.data.plan?.verificationNotes ?? defaults.plan.verificationNotes,
			explorationCommands: latest.data.plan?.explorationCommands ?? defaults.plan.explorationCommands,
			phases: latest.data.plan?.phases ?? defaults.plan.phases,
		},
	};
}

export function updateWorkflowMode(state: WorkflowState, mode: WorkflowMode): WorkflowState {
	return { ...state, mode };
}

export function updateWorkflowApprovalState(state: WorkflowState, approvalState: WorkflowApprovalState): WorkflowState {
	return {
		...state,
		plan: {
			...state.plan,
			approvalState,
		},
	};
}

export function updateWorkflowPlanGoal(state: WorkflowState, goal: string): WorkflowState {
	return {
		...state,
		plan: {
			...state.plan,
			goal: goal.trim(),
			approvalState: "draft",
		},
	};
}

function isLikelySlashCommandArtifact(path: string): boolean {
	const trimmed = path.trim();
	return /^\/[A-Za-z0-9_-]+$/.test(trimmed);
}

export function sanitizeWorkflowPlanState(plan: WorkflowState["plan"]): WorkflowState["plan"] {
	const targetFiles = plan.targetFiles.filter((path) => !isLikelySlashCommandArtifact(path));
	if (targetFiles.length === plan.targetFiles.length) return plan;
	return {
		...plan,
		targetFiles,
		explorationCommands: buildReadOnlyExplorationCommands(targetFiles),
	};
}

export function updateWorkflowPlanScaffold(state: WorkflowState, goal: string): WorkflowState {
	return {
		...state,
		plan: sanitizeWorkflowPlanState(buildPlanScaffoldFromGoal(goal)),
	};
}

export function resetWorkflowStateForFreshPlanning(goal = ""): WorkflowState {
	const defaults = createDefaultWorkflowState();
	if (!goal.trim()) return defaults;
	return updateWorkflowPlanScaffold(defaults, goal);
}

export function buildParkedWorkflowPlan(stashRef: string, targetFiles: string[], stashMessage?: string): WorkflowPlanState {
	const normalizedTargetFiles = Array.from(new Set(targetFiles.map((path) => path.trim()).filter(Boolean)));
	const trimmedMessage = stashMessage?.trim();
	return sanitizeWorkflowPlanState({
		goal: `Resume parked Helmsman edits from ${stashRef}`,
		currentPhase: 1,
		currentStep: 1,
		targetFiles: normalizedTargetFiles,
		approvalState: "draft",
		constraints: [
			"Do not delete parked changes",
			"Restore from stash before resuming",
			"Keep Beads traceability",
		],
		assumptions: [
			`stash ref ${stashRef} exists`,
			trimmedMessage ? `stash message: ${trimmedMessage}` : "stash message identifies the parked task",
			"no new unrelated edits were mixed in",
		],
		verificationNotes: ["Apply the stash", "Confirm git status", "Run focused tests"],
		explorationCommands: [
			"git stash list --format='%gd %s'",
			`git stash show --name-only --format= ${stashRef}`,
			"rtk git status --short --branch",
		],
		phases: [
			{
				name: "Parked",
				steps: ["Keep the edits safely stored in the stash", "Record the stash ref in Beads", "Do not mutate the parked files"],
			},
			{
				name: "Restore",
				steps: ["Apply the stash when the task resumes", "Confirm the same files return", "Restore staged state only if needed"],
			},
			{
				name: "Validate",
				steps: ["Confirm the dirty set matches the parked plan", "Run focused tests", "Proceed only after the parked record is consistent"],
			},
		],
	});
}

export function mergeWorkflowPlanState(current: WorkflowState["plan"], parsed: ParsedWorkflowPlanResult): WorkflowState["plan"] {
	return sanitizeWorkflowPlanState({
		goal: parsed.present.goal ? parsed.plan.goal : current.goal,
		currentPhase: parsed.present.currentPhase ? parsed.plan.currentPhase : current.currentPhase,
		currentStep: parsed.present.currentStep ? parsed.plan.currentStep : current.currentStep,
		targetFiles: parsed.present.targetFiles ? parsed.plan.targetFiles : current.targetFiles,
		approvalState: parsed.present.approvalState ? parsed.plan.approvalState : current.approvalState,
		constraints: parsed.present.constraints ? parsed.plan.constraints : current.constraints,
		assumptions: parsed.present.assumptions ? parsed.plan.assumptions : current.assumptions,
		verificationNotes: parsed.present.verificationNotes ? parsed.plan.verificationNotes : current.verificationNotes,
		explorationCommands: parsed.present.targetFiles ? parsed.plan.explorationCommands : current.explorationCommands,
		phases: parsed.present.phases ? parsed.plan.phases : current.phases,
	});
}

export function shouldRunPreHandoffReview(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed) return false;
	if (/\bTrigger:\s*.+\bConfidence:\s*(?:low|medium|high)\b[\s\S]*\bDecision:\s*(?:continue|handoff)\b/i.test(trimmed)) {
		return false;
	}
	return /\b(done|completed|finished|human gate|next task|next work|only open issue|hand(?:ing)? back|wrap(?:ped)? up|all set)\b/i.test(trimmed);
}

export function parsePreHandoffReview(text: string): WorkflowSelfReview | null {
	const trigger = text.match(/^Trigger:\s*(.+)$/im)?.[1]?.trim();
	const confidence = text.match(/^Confidence:\s*(low|medium|high)$/im)?.[1]?.toLowerCase() as WorkflowSelfReview["confidence"] | undefined;
	const risk = text.match(/^Risk:\s*(low|medium|high)$/im)?.[1]?.toLowerCase() as WorkflowSelfReview["risk"] | undefined;
	const validation = text.match(/^Validation:\s*(sufficient|insufficient)$/im)?.[1]?.toLowerCase() as WorkflowSelfReview["validation"] | undefined;
	const decision = text.match(/^Decision:\s*(continue|handoff)$/im)?.[1]?.toLowerCase() as WorkflowSelfReview["decision"] | undefined;
	const reasoning = text.match(/^Reasoning:\s*([\s\S]*?)(?:\nFollow-up:|$)/im)?.[1]?.replace(/\s+/g, " ")?.trim();
	const followUpSection = text.match(/^Follow-up:\s*([\s\S]*)$/im)?.[1] ?? "";
	const followUp = followUpSection
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.startsWith("- "))
		.map((line) => line.slice(2).trim())
		.filter(Boolean);
	if (!trigger || !confidence || !risk || !validation || !decision || !reasoning) return null;
	return {
		trigger,
		confidence,
		risk,
		validation,
		decision,
		reasoning,
		followUp,
	};
}

export function formatWorkflowStatus(state: WorkflowState, plannerRuntime?: string): string {
	const targetLines = state.plan.targetFiles.length > 0 ? state.plan.targetFiles.map((path) => `- ${path}`).join("\n") : "none";
	const constraintLines = state.plan.constraints.length > 0 ? state.plan.constraints.map((item) => `- ${item}`).join("\n") : "none";
	const assumptionLines = state.plan.assumptions.length > 0 ? state.plan.assumptions.map((item) => `- ${item}`).join("\n") : "none";
	const verificationLines = state.plan.verificationNotes.length > 0
		? state.plan.verificationNotes.map((item) => `- ${item}`).join("\n")
		: "none";
	const explorationLines = state.plan.explorationCommands.length > 0
		? state.plan.explorationCommands.map((item) => `- ${item}`).join("\n")
		: "none";
	const phaseLines = state.plan.phases.length > 0
		? state.plan.phases
				.map(
					(phase, index) =>
						`Phase ${index + 1}: ${phase.name}\n${phase.steps.map((step, stepIndex) => `  ${stepIndex + 1}. ${step}`).join("\n")}`,
				)
				.join("\n")
		: "none";

	return [
		plannerRuntime,
		`Mode: ${state.mode}`,
		`Goal: ${state.plan.goal || "none"}`,
		`Current phase: ${state.plan.currentPhase ?? "none"}`,
		`Current step: ${state.plan.currentStep ?? "none"}`,
		`Target files: ${state.plan.targetFiles.length > 0 ? "" : "none"}`,
		state.plan.targetFiles.length > 0 ? targetLines : undefined,
		`Constraints: ${state.plan.constraints.length > 0 ? "" : "none"}`,
		state.plan.constraints.length > 0 ? constraintLines : undefined,
		`Assumptions: ${state.plan.assumptions.length > 0 ? "" : "none"}`,
		state.plan.assumptions.length > 0 ? assumptionLines : undefined,
		`Verification notes: ${state.plan.verificationNotes.length > 0 ? "" : "none"}`,
		state.plan.verificationNotes.length > 0 ? verificationLines : undefined,
		`Read-only exploration commands: ${state.plan.explorationCommands.length > 0 ? "" : "none"}`,
		state.plan.explorationCommands.length > 0 ? explorationLines : undefined,
		`Phases: ${state.plan.phases.length > 0 ? "" : "none"}`,
		state.plan.phases.length > 0 ? phaseLines : undefined,
		`Approval: ${state.plan.approvalState}`,
	]
		.filter(Boolean)
		.join("\n");
}
