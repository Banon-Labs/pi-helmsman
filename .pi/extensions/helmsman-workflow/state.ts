import type { CustomStateEntryLike, WorkflowMode, WorkflowState } from "./types";

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

export function formatWorkflowStatus(state: WorkflowState): string {
	const targetLines = state.plan.targetFiles.length > 0 ? state.plan.targetFiles.map((path) => `- ${path}`).join("\n") : "none";

	return [
		`Mode: ${state.mode}`,
		`Goal: ${state.plan.goal || "none"}`,
		`Current phase: ${state.plan.currentPhase ?? "none"}`,
		`Current step: ${state.plan.currentStep ?? "none"}`,
		`Target files: ${state.plan.targetFiles.length > 0 ? "" : "none"}`,
		state.plan.targetFiles.length > 0 ? targetLines : undefined,
		`Approval: ${state.plan.approvalState}`,
	]
		.filter(Boolean)
		.join("\n");
}
