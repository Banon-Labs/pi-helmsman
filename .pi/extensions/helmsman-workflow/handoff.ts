import type { WorkflowPlanState, WorkflowState } from "./types";

function formatList(items: string[], empty = "- none"): string {
	return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : empty;
}

function formatPhases(plan: WorkflowPlanState): string {
	if (plan.phases.length === 0) return "- none";
	return plan.phases
		.map((phase, phaseIndex) => {
			const steps = phase.steps.length > 0 ? phase.steps.map((step, stepIndex) => `  ${stepIndex + 1}. ${step}`).join("\n") : "  - none";
			return `- Phase ${phaseIndex + 1}: ${phase.name}\n${steps}`;
		})
		.join("\n");
}

export function describeWorkflowPosition(plan: WorkflowPlanState): string {
	if (plan.currentPhase && plan.currentStep) return `phase ${plan.currentPhase}, step ${plan.currentStep}`;
	if (plan.currentPhase) return `phase ${plan.currentPhase}`;
	if (plan.currentStep) return `step ${plan.currentStep}`;
	return "not started";
}

export function resolveWorkflowHandoffGoal(state: WorkflowState, requestedGoal: string): string {
	const trimmed = requestedGoal.trim();
	if (trimmed) return trimmed;
	if (state.plan.goal.trim()) return `Continue ${JSON.stringify(state.plan.goal.trim())} from ${describeWorkflowPosition(state.plan)}.`;
	return "Continue the current Helmsman workflow in a fresh focused session.";
}

export function buildWorkflowHandoffPrompt(state: WorkflowState, requestedGoal: string): string {
	const nextTask = resolveWorkflowHandoffGoal(state, requestedGoal);

	return [
		"## Helmsman Context",
		`- Mode: ${state.mode}`,
		`- Goal: ${state.plan.goal || "none"}`,
		`- Approval: ${state.plan.approvalState}`,
		`- Current position: ${describeWorkflowPosition(state.plan)}`,
		"",
		"### Target Files",
		formatList(state.plan.targetFiles),
		"",
		"### Constraints",
		formatList(state.plan.constraints),
		"",
		"### Assumptions",
		formatList(state.plan.assumptions),
		"",
		"### Verification Notes",
		formatList(state.plan.verificationNotes),
		"",
		"### Planned Phases",
		formatPhases(state.plan),
		"",
		"## Task",
		nextTask,
		"",
		"## Native Resume Hints",
		"- Run /status to render the persisted Helmsman workflow state in this session.",
		"- Use /resume to jump back to the previous session if you need the original transcript; parent-session linkage is preserved.",
	].join("\n");
}

function trimSessionName(value: string, maxLength = 72): string {
	const normalized = value.replace(/\s+/g, " ").trim();
	if (!normalized) return "Helmsman handoff";
	if (normalized.length <= maxLength) return normalized;
	return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function buildWorkflowHandoffSessionName(state: WorkflowState, requestedGoal: string): string {
	const seed = requestedGoal.trim() || state.plan.goal.trim() || "Helmsman handoff";
	return trimSessionName(`Helmsman: ${seed}`);
}
