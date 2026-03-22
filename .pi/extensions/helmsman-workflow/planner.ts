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

export function buildReadOnlyExplorationCommands(targetFiles: string[]): string[] {
	if (targetFiles.length === 0) {
		return [
			"rtk git status --short --branch",
			"rtk find ./.pi/extensions -maxdepth 2 -type f",
			"rtk grep \"TODO|plan|workflow\" . -n",
		];
	}

	const targeted = targetFiles.slice(0, 2).map((path) => `rtk read ./${path.replace(/^\.\//, "")} --max-lines 200`);
	return [...targeted, 'rtk grep "helmsman-workflow" . -n'];
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
	const targetFiles = extractTargetFileHints(goal);
	return {
		goal: goal.trim(),
		currentPhase: 1,
		currentStep: 1,
		targetFiles,
		approvalState: "draft",
		constraints: ["Stay conservative: prefer read-only inspection until the plan is validated."],
		assumptions: [summarizeGoalAsAssumption(goal)],
		verificationNotes: ["Validate with focused tests first, then use tmux smoke proof for runtime behavior changes."],
		explorationCommands: buildReadOnlyExplorationCommands(targetFiles),
		phases: buildDefaultPhases(),
	};
}
