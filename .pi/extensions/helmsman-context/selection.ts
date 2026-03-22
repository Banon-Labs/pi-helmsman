import type { RepoCandidate } from "./types.js";

export interface RepoSelectionDecisionInput {
	hasExplicitTarget: boolean;
	selectableCandidates: RepoCandidate[];
}

function getSharedReasons(candidates: RepoCandidate[]): string[] {
	if (candidates.length === 0) return [];
	const [first, ...rest] = candidates;
	return first.reasons.filter((reason) => rest.every((candidate) => candidate.reasons.includes(reason)));
}

export function chooseSelectableCandidates(candidates: RepoCandidate[]): RepoCandidate[] {
	if (candidates.length === 0) return [];
	const topScore = candidates[0].score;
	return candidates.filter((candidate) => candidate.score === topScore);
}

export function formatSelectableCandidateLabel(candidate: RepoCandidate): string {
	const reasons = candidate.reasons.slice(0, 2).join(", ") || "no distinguishing evidence";
	return `${candidate.repoName} — score=${candidate.score} — ${reasons}`;
}

export function formatSelectableCandidateDetails(candidates: RepoCandidate[]): string {
	const sharedReasons = getSharedReasons(candidates);
	const lines = candidates.map((candidate, index) => {
		const reasons = candidate.reasons.join(", ") || "no distinguishing evidence";
		const distinguishingReasons = candidate.reasons.filter((reason) => !sharedReasons.includes(reason)).join(", ") || "none beyond shared tie evidence";
		return [
			`${index + 1}. ${candidate.repoName}`,
			`   Path: ${candidate.repoRoot}`,
			`   Reasons: ${reasons}`,
			`   Distinguishing evidence: ${distinguishingReasons}`,
		].join("\n");
	});
	return [
		"Ambiguous repo candidates:",
		sharedReasons.length > 0 ? `Shared tie evidence: ${sharedReasons.join(", ")}` : "Shared tie evidence: none",
		...lines,
	].join("\n");
}

export function shouldPromptForRepoSelection(input: RepoSelectionDecisionInput): boolean {
	return !input.hasExplicitTarget && input.selectableCandidates.length > 1;
}
