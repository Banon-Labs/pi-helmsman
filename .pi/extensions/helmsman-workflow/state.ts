import type { CustomStateEntryLike, WorkflowMode, WorkflowState } from "./types";
import { buildPlanScaffoldFromGoal } from "./planner";

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
			phases: latest.data.plan?.phases ?? defaults.plan.phases,
		},
	};
}

export function updateWorkflowMode(state: WorkflowState, mode: WorkflowMode): WorkflowState {
	return { ...state, mode };
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

export function updateWorkflowPlanScaffold(state: WorkflowState, goal: string): WorkflowState {
	return {
		...state,
		plan: buildPlanScaffoldFromGoal(goal),
	};
}

export function formatWorkflowStatus(state: WorkflowState): string {
	const targetLines = state.plan.targetFiles.length > 0 ? state.plan.targetFiles.map((path) => `- ${path}`).join("\n") : "none";
	const constraintLines = state.plan.constraints.length > 0 ? state.plan.constraints.map((item) => `- ${item}`).join("\n") : "none";
	const assumptionLines = state.plan.assumptions.length > 0 ? state.plan.assumptions.map((item) => `- ${item}`).join("\n") : "none";
	const verificationLines = state.plan.verificationNotes.length > 0
		? state.plan.verificationNotes.map((item) => `- ${item}`).join("\n")
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
		`Phases: ${state.plan.phases.length > 0 ? "" : "none"}`,
		state.plan.phases.length > 0 ? phaseLines : undefined,
		`Approval: ${state.plan.approvalState}`,
	]
		.filter(Boolean)
		.join("\n");
}
