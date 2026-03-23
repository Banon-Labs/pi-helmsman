export const SOMETHING_ELSE_OPTION = "Something else";

const STRICT_PLAN_SECTION_HEADERS = [
	"Goal",
	"Constraints",
	"Assumptions",
	"Target Files",
	"Current Phase",
	"Plan",
	"Verification Notes",
	"Approval State",
] as const;

function buildChoiceOptions(optionOne: string, optionTwo: string): [string, string, typeof SOMETHING_ELSE_OPTION] {
	return [optionOne, optionTwo, SOMETHING_ELSE_OPTION];
}

export function getCollaborativeReplanChoices(): [string, string, typeof SOMETHING_ELSE_OPTION] {
	return buildChoiceOptions("Review the updated plan.", "Stay in plan mode with the current draft.");
}

export function getApprovalRequiredChoices(): [string, string, typeof SOMETHING_ELSE_OPTION] {
	return buildChoiceOptions("Approve the current plan.", "Revise the plan before execution.");
}

export function getVerificationFailureChoices(): [string, string, typeof SOMETHING_ELSE_OPTION] {
	return buildChoiceOptions("Review the failure and adjust the plan.", "Revise the validation approach before retrying.");
}

export function buildStrictStructuredPlanPrompt(): string {
	return [
		"Return only a strict Helmsman-compatible /plan string.",
		"Use exactly these section headers in this order:",
		...STRICT_PLAN_SECTION_HEADERS.map((header) => `${header}:`),
		"Use bullet lists for Constraints, Assumptions, Target Files, and Verification Notes.",
		"Under Plan:, list phases as 'Phase N: Name' followed by numbered steps.",
		"Keep each phase to 3-5 steps.",
		"Leave Approval State as draft.",
		"Do not add prose before or after the structured plan.",
	].join("\n");
}

export function buildRiskyStepEvidencePolicyPrompt(): string {
	return [
		"For risky or order-sensitive steps, require a visible evidence-first verification packet before any administrative or completion action.",
		"Treat these as risky steps: closing or reopening a bd issue, claiming completion, changing workflow state based on prior verification, or relying on scope-recovery after an earlier sequencing mistake.",
		"Before any risky step, show concrete RTK command outputs for repo state, touched-file scope, key invariant checks, direct parser/draft inspection, and runtime smoke evidence when behavior changed.",
		"Present raw evidence first, then a separate cross-check section, and only then any decision or administrative action.",
		"Do not rely on summaries alone when risky steps are involved.",
		"Fail closed: if any required evidence is missing or ambiguous, stay read-only and do not mutate bd/admin state.",
		"Use a pre-mutation confidence checkpoint that answers whether the repo is clean and synced, touched files are in scope, critical exact strings are unchanged, focused coverage is visible, parser/draft safety is directly evidenced, and runtime smoke evidence is visible when behavior changed.",
	].join("\n");
}

export function buildPlanModeSystemPrompt(): string {
	return [
		"[HELMSMAN PLAN MODE]",
		"Work like a careful, professional collaborator.",
		"Treat the current request as planning work, not execution.",
		"Ask clarifying questions when key requirements, constraints, or intent are still uncertain.",
		"Prefer read-only repo exploration with read, grep, find, ls, bash, fetch_reference, fetch_web, and search_web.",
		"Surface assumptions and uncertainty plainly so the user can stay in control.",
		buildRiskyStepEvidencePolicyPrompt(),
		buildStrictStructuredPlanPrompt(),
	].join("\n");
}

export function buildPlanModeActivationNotice(): string {
	return "Plan mode is active. I’ll stay read-only, surface assumptions clearly, and ask for clarification before guessing.";
}

export function buildCollaborativeReplanNotice(blockedReason: string): string {
	return `${blockedReason} I’m moving us back to plan mode so we can confirm the next step together.`;
}

export function buildApprovalRequiredNotice(blockedReason: string): string {
	return `${blockedReason} Review the current plan and approve it when you’re comfortable proceeding.`;
}

export function buildVerificationFailureNotice(blockedReason: string): string {
	return `${blockedReason} I captured the failure and returned to planning so we can reassess before continuing.`;
}
