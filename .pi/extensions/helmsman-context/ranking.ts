import { existsSync } from "node:fs";
import { join, normalize } from "node:path";
import type { RepoCandidate } from "./types.js";

export interface RankingSignals {
	currentRepoRoot?: string;
	inputText: string;
	lastGoalText: string;
}

const RELATIVE_PATH_PATTERN = /\b([a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+)\b/g;

function includesCaseInsensitive(haystack: string, needle: string): boolean {
	return haystack.toLowerCase().includes(needle.toLowerCase());
}

function extractRepoRelativePathHints(text: string): string[] {
	const hints = new Set<string>();
	for (const match of text.matchAll(RELATIVE_PATH_PATTERN)) {
		const candidate = match[1] ?? "";
		if (!candidate || candidate.startsWith("./") || candidate.startsWith("../")) continue;
		hints.add(candidate);
	}
	return Array.from(hints);
}

function hasMatchingRepoRelativePath(repoRoot: string, inputText: string): boolean {
	return extractRepoRelativePathHints(inputText).some((hint) => existsSync(normalize(join(repoRoot, hint))));
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
	if (hasMatchingRepoRelativePath(candidate.repoRoot, signals.inputText)) {
		score += 100;
		reasons.push("repo-relative path exists in candidate");
	}

	return { ...candidate, score, reasons };
}
