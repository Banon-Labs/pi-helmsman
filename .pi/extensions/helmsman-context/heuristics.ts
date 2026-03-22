import { scoreCandidateWithWorkspaceEvidence } from "./evidence.js";
import { detectSuggestedFolder } from "./folders.js";
import { scoreCandidateWithSignals } from "./ranking.js";
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

function rankCandidates(
	input: AssessContextInput,
	candidates: RepoCandidate[],
	inputText: string,
	currentRepoRoot: string | undefined,
	lastGoalText: string,
): RepoCandidate[] {
	return candidates
		.map((candidate) =>
			scoreCandidateWithWorkspaceEvidence(
				scoreCandidateWithSignals(candidate, {
					currentRepoRoot,
					inputText,
					lastGoalText,
				}),
				input.workspaceEvidenceText ?? "",
			),
		)
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

function formatCandidateReasons(candidate: RepoCandidate | undefined): string {
	if (!candidate) return "no distinguishing evidence";
	return candidate.reasons.join(", ") || "no distinguishing evidence";
}

function explainDecision(selectedRepo: RepoCandidate | undefined, currentRepoCandidate: RepoCandidate | undefined): string | undefined {
	if (!selectedRepo || !currentRepoCandidate) return undefined;
	if (selectedRepo.repoRoot === currentRepoCandidate.repoRoot) return undefined;
	return [
		`Selected ${selectedRepo.repoName} over current repo ${currentRepoCandidate.repoName}.`,
		`Winner: score=${selectedRepo.score}; reasons=${formatCandidateReasons(selectedRepo)}.`,
		`Current repo: score=${currentRepoCandidate.score}; reasons=${formatCandidateReasons(currentRepoCandidate)}.`,
	].join(" ");
}

export function assessContext(input: AssessContextInput): ContextAssessment {
	const rankedCandidates = rankCandidates(input, input.candidates, input.inputText, input.currentRepoRoot, input.lastGoalText ?? "");
	const explicitRepo = findExplicitRepoMention(rankedCandidates, input.inputText);
	const selectedRepo = explicitRepo ?? rankedCandidates[0];
	const currentRepoCandidate = input.currentRepoRoot
		? rankedCandidates.find((candidate) => candidate.repoRoot === input.currentRepoRoot)
		: undefined;

	let state: ContextAssessment["state"] = "healthy";
	if (!input.currentRepoRoot) {
		state = "uncertain";
	} else if (explicitRepo && explicitRepo.repoRoot !== input.currentRepoRoot) {
		state = "mismatch";
	} else if (selectedRepo && selectedRepo.repoRoot !== input.currentRepoRoot && selectedRepo.score >= 60) {
		state = "mismatch";
	}

	const suggestedFolderHint = selectedRepo
		? detectSuggestedFolder({
			targetRepoRoot: selectedRepo.repoRoot,
			inputText: input.inputText,
		})
		: undefined;

	return {
		state,
		workspaceRoot: input.workspaceRoot,
		currentRepoRoot: input.currentRepoRoot,
		currentRepoCandidate,
		selectedRepo,
		decisionExplanation: explainDecision(selectedRepo, currentRepoCandidate),
		suggestedFolder: suggestedFolderHint?.path,
		suggestedFolderSource: suggestedFolderHint?.source,
		suggestedFolderBasis: suggestedFolderHint?.basis,
		blockMutations: state === "mismatch",
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
