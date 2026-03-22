import type { WorkflowPlanPhase, WorkflowPlanState } from "./types";

const PATH_HINT_PATTERN = /(?:\/[^\s,:;()]+|(?:\.?\.\/)?[A-Za-z0-9_./-]+\.[A-Za-z0-9_-]+)/g;

export function extractTargetFileHints(goal: string): string[] {
	const matches = goal.match(PATH_HINT_PATTERN) ?? [];
	const cleaned = matches
		.map((match) => match.trim())
		.filter((match) => match.includes("/") || match.includes("."));
	return [...new Set(cleaned)];
}

export function summarizeGoalAsAssumption(goal: string): string {
	const trimmed = goal.trim();
	if (!trimmed) return "The exact implementation details still need clarification.";
	return `The user wants: ${trimmed}`;
}

function buildDefaultPhases(): WorkflowPlanPhase[] {
	return [
		{
			name: "Clarify and inspect",
			steps: [
				"Clarify any missing requirements before implementation.",
				"Inspect the relevant code paths and nearby tests using read-only tools.",
				"Confirm the most likely files to change and the expected verification path.",
			],
		},
		{
			name: "Implement and verify",
			steps: [
				"Land the smallest code change that satisfies the clarified goal.",
				"Run focused validation for the touched behavior.",
				"Summarize remaining risks or follow-up work before execution proceeds further.",
			],
		},
	];
}

export function buildPlanScaffoldFromGoal(goal: string): WorkflowPlanState {
	return {
		goal: goal.trim(),
		currentPhase: 1,
		currentStep: 1,
		targetFiles: extractTargetFileHints(goal),
		approvalState: "draft",
		constraints: ["Stay conservative: prefer read-only inspection until the plan is validated."],
		assumptions: [summarizeGoalAsAssumption(goal)],
		verificationNotes: ["Validate with focused tests first, then use tmux smoke proof for runtime behavior changes."],
		phases: buildDefaultPhases(),
	};
}
