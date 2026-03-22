import { detectSuggestedFolder } from "./folders.js";
import type { RepoCandidate } from "./types.js";

export interface RankingSignals {
	currentRepoRoot?: string;
	inputText: string;
	lastGoalText: string;
}

function includesCaseInsensitive(haystack: string, needle: string): boolean {
	return haystack.toLowerCase().includes(needle.toLowerCase());
}

function hasCrossRepoActionIntent(inputText: string): boolean {
	return /\b(?:switch|move|work|implement|change|update|fix|inspect|edit)\b[\s\S]*\b(?:there|in|inside|within)\b/i.test(inputText)
		|| /\b(?:make the change there|implement the change there|work there)\b/i.test(inputText);
}

function hasReadOnlyReferenceIntent(text: string): boolean {
	return /\b(?:read[ -]?only|readonly|reference(?: repo)?|for reference|as reference|local reference)\b/i.test(text);
}

function scoreRelativePathEvidence(repoRoot: string, inputText: string): { score: number; reason?: string } {
	const hint = detectSuggestedFolder({ targetRepoRoot: repoRoot, inputText });
	if (!hint || hint.source !== "relative") return { score: 0 };
	if (hint.basis === "directory") {
		return {
			score: 120,
			reason: "repo-relative directory path exists in candidate",
		};
	}
	if (hint.basis === "file-parent") {
		return {
			score: 110,
			reason: "repo-relative file path exists in candidate",
		};
	}
	return { score: 0 };
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
		if (hasReadOnlyReferenceIntent(signals.lastGoalText)) {
			score += 5;
			reasons.push("repo mentioned as read-only reference in goal");
		} else if (hasCrossRepoActionIntent(signals.lastGoalText)) {
			score += 70;
			reasons.push("repo work intent mentioned in goal");
		} else {
			score += 20;
			reasons.push("repo name mentioned in goal");
		}
	} else if (includesCaseInsensitive(signals.inputText, candidate.repoName)) {
		if (hasReadOnlyReferenceIntent(signals.inputText)) {
			score += 5;
			reasons.push("repo mentioned as read-only reference in input");
		} else {
			score += 10;
			reasons.push("repo name mentioned in input");
			if (hasCrossRepoActionIntent(signals.inputText)) {
				score += 50;
				reasons.push("cross-repo action intent in input");
			}
		}
	}
	const relativePathEvidence = scoreRelativePathEvidence(candidate.repoRoot, signals.inputText);
	if (relativePathEvidence.score > 0) {
		score += relativePathEvidence.score;
		if (relativePathEvidence.reason) reasons.push(relativePathEvidence.reason);
	}
	return { ...candidate, score, reasons };
}
