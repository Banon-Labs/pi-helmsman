import type { RepoCandidate } from "./types.js";

export interface RankingSignals {
	currentRepoRoot?: string;
	inputText: string;
	lastGoalText: string;
}

function includesCaseInsensitive(haystack: string, needle: string): boolean {
	return haystack.toLowerCase().includes(needle.toLowerCase());
}

export function scoreCandidateWithSignals(candidate: RepoCandidate, signals: RankingSignals): RepoCandidate {
	const reasons: string[] = [];
	let score = 0;

	if (candidate.repoRoot === signals.currentRepoRoot) {
		score += 40;
		reasons.push("current repo");
	}
	if (candidate.hasBeads) {
		score += 20;
		reasons.push("has .beads");
	}
	if (includesCaseInsensitive(signals.inputText, candidate.repoRoot)) {
		score += 80;
		reasons.push("repo path mentioned in input");
	}
	if (includesCaseInsensitive(signals.lastGoalText, candidate.repoName)) {
		score += 70;
		reasons.push("repo name mentioned in goal");
	} else if (includesCaseInsensitive(signals.inputText, candidate.repoName)) {
		score += 60;
		reasons.push("repo name mentioned in input");
	}

	return { ...candidate, score, reasons };
}
