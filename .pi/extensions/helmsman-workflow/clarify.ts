import { extractTargetFileHints } from "./planner";

export const CLARIFICATION_OTHER_OPTION = "Something else";

export function getClarificationChoices(goal: string): [string, string, typeof CLARIFICATION_OTHER_OPTION] {
	const trimmed = goal.trim();
	return [
		`Focus first on the intended outcome for \"${trimmed}\".`,
		`Focus first on the files or repo area for \"${trimmed}\".`,
		CLARIFICATION_OTHER_OPTION,
	];
}

export function shouldClarifyGoal(goal: string): boolean {
	const trimmed = goal.trim();
	if (!trimmed) return false;
	if (extractTargetFileHints(trimmed).length > 0) return false;
	const words = trimmed.split(/\s+/).filter(Boolean);
	return words.length <= 3;
}

export function getClarificationQuestion(_goal: string): string {
	return "What outcome should this plan optimize for, and which files or repo area should it focus on?";
}

export function buildClarifiedGoal(goal: string, clarification: string): string {
	const answer = clarification.trim();
	if (!answer) return goal.trim();
	return `${goal.trim()}\n\nClarification: ${answer}`;
}
