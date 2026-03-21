import type { ContextAssessment } from "./types.js";

export interface ContextRoutePlan {
	targetRepoRoot: string;
	command: string;
	handoffPrompt: string;
}

export interface BuildContextRoutePlanInput {
	assessment: ContextAssessment;
	sessionFile: string;
	lastInputText: string;
}

export function buildContextRoutePlan(input: BuildContextRoutePlanInput): ContextRoutePlan | undefined {
	const targetRepoRoot = input.assessment.selectedRepo?.repoRoot;
	if (!targetRepoRoot) return undefined;

	const command = `cd ${targetRepoRoot} && pi --fork ${input.sessionFile}`;
	const handoffPrompt = [
		"Continue this task in the target repo selected by Helmsman context routing.",
		`Originating goal: ${input.lastInputText || "continue previous task"}`,
		`Current repo: ${input.assessment.currentRepoRoot ?? "unresolved"}`,
		`Target repo: ${targetRepoRoot}`,
		`Context state: ${input.assessment.state}`,
		`Context summary: ${input.assessment.summary}`,
	].join("\n");

	return {
		targetRepoRoot,
		command,
		handoffPrompt,
	};
}
