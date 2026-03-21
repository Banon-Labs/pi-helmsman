import type { AssessContextInput, ContextAssessment, RepoCandidate } from "./types.js";

const READ_ONLY_PREFIXES = [
	"pwd",
	"ls",
	"find ",
	"rg ",
	"grep ",
	"tree",
	"head ",
	"tail ",
	"wc ",
	"git status",
	"git diff --stat",
	"git branch",
	"git remote",
	"git rev-parse",
	"git log",
	"bd show",
	"bd ready",
	"bd comments",
	"bd status",
	"bd where",
	"bd context",
];

function normalizeText(text: string): string {
	return text.toLowerCase();
}

function scoreCandidate(candidate: RepoCandidate, inputText: string, currentRepoRoot: string | undefined): RepoCandidate {
	const reasons: string[] = [];
	let score = 0;
	const normalized = normalizeText(inputText);
	if (candidate.repoRoot === currentRepoRoot) {
		score += 40;
		reasons.push("current repo");
	}
	if (candidate.hasBeads) {
		score += 20;
		reasons.push("has .beads");
	}
	if (normalized.includes(candidate.repoName.toLowerCase())) {
		score += 60;
		reasons.push("repo name mentioned in input");
	}
	return { ...candidate, score, reasons };
}

function rankCandidates(candidates: RepoCandidate[], inputText: string, currentRepoRoot: string | undefined): RepoCandidate[] {
	return candidates
		.map((candidate) => scoreCandidate(candidate, inputText, currentRepoRoot))
		.sort((a, b) => b.score - a.score || a.repoName.localeCompare(b.repoName));
}

function findExplicitRepoMention(candidates: RepoCandidate[], inputText: string): RepoCandidate | undefined {
	const normalized = normalizeText(inputText);
	return candidates.find((candidate) => normalized.includes(candidate.repoName.toLowerCase()));
}

function summarize(state: ContextAssessment["state"], selectedRepo: RepoCandidate | undefined, currentRepoRoot: string | undefined) {
	if (state === "healthy") {
		return `Context healthy in ${selectedRepo?.repoName ?? currentRepoRoot ?? "current repo"}`;
	}
	if (state === "mismatch") {
		return `Context mismatch: requested repo appears to be ${selectedRepo?.repoName ?? "another repo"}`;
	}
	return "Context uncertain: repo suitability is unresolved";
}

export function assessContext(input: AssessContextInput): ContextAssessment {
	const rankedCandidates = rankCandidates(input.candidates, input.inputText, input.currentRepoRoot);
	const explicitRepo = findExplicitRepoMention(rankedCandidates, input.inputText);
	const selectedRepo = explicitRepo ?? rankedCandidates[0];

	let state: ContextAssessment["state"] = "healthy";
	if (!input.currentRepoRoot) {
		state = "uncertain";
	} else if (explicitRepo && explicitRepo.repoRoot !== input.currentRepoRoot) {
		state = "mismatch";
	} else if (selectedRepo && selectedRepo.repoRoot !== input.currentRepoRoot && selectedRepo.score >= 60) {
		state = "mismatch";
	}

	return {
		state,
		workspaceRoot: input.workspaceRoot,
		currentRepoRoot: input.currentRepoRoot,
		selectedRepo,
		blockMutations: state !== "healthy",
		summary: summarize(state, selectedRepo, input.currentRepoRoot),
		candidates: rankedCandidates,
	};
}

export function isReadOnlyBashCommand(command: string): boolean {
	const normalized = command.trim().toLowerCase();
	if (!normalized) return true;
	if (["&&", "||", ";", ">", "<", " rm ", " mv ", " cp ", " chmod ", " chown "].some((token) => normalized.includes(token))) {
		return false;
	}
	return READ_ONLY_PREFIXES.some((prefix) => normalized === prefix.trim() || normalized.startsWith(prefix));
}
