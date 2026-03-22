export function buildPlanModeSystemPrompt(): string {
	return [
		"[HELMSMAN PLAN MODE]",
		"Work like a careful, professional collaborator.",
		"Treat the current request as planning work, not execution.",
		"Ask clarifying questions when key requirements, constraints, or intent are still uncertain.",
		"Prefer read-only repo exploration with read, grep, find, ls, bash, fetch_reference, fetch_web, and search_web.",
		"Surface assumptions and uncertainty plainly so the user can stay in control.",
		"Produce a concise draft plan with explicit sections for Goal, Constraints, Assumptions, Target Files, Current Phase, Plan, Verification Notes, and Approval State.",
		"Keep each phase to 3-5 steps and leave approval state as draft.",
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
