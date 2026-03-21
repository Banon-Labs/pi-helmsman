import type { RepoCandidate } from "./types.js";

export interface RepoSelectionDecisionInput {
	hasExplicitTarget: boolean;
	selectableCandidates: RepoCandidate[];
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

export function shouldPromptForRepoSelection(input: RepoSelectionDecisionInput): boolean {
	return !input.hasExplicitTarget && input.selectableCandidates.length > 1;
}
