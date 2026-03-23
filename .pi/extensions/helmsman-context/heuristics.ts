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
	"rtk read",
	"rtk git status",
	"rtk git diff",
	"rtk git log",
	"rtk git show",
	"rtk git branch",
	"rtk find",
	"rtk grep",
	"rtk ls",
];

function stripLeadingReadOnlyShellWrappers(command: string): string {
	let normalized = command.trim();
	for (let depth = 0; depth < 4; depth += 1) {
		const cdWrapper = normalized.match(/^cd\s+[^&|;]+\s+&&\s+(.+)$/i);
		if (cdWrapper) {
			normalized = cdWrapper[1].trim();
			continue;
		}
		break;
	}
	return normalized;
}

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

function hasCrossRepoActionIntent(inputText: string): boolean {
	return /\b(?:switch|move|work|implement|change|update|fix|inspect|edit)\b[\s\S]*\b(?:there|in|inside|within)\b/i.test(inputText)
		|| /\b(?:make the change there|implement the change there|work there)\b/i.test(inputText);
}

function hasReadOnlyReferenceIntent(text: string): boolean {
	return /\b(?:read[ -]?only|readonly|reference(?: repo)?|for reference|as reference|local reference)\b/i.test(text);
}

function hasStrongMismatchEvidence(candidate: RepoCandidate | undefined, inputText: string, lastGoalText: string): boolean {
	if (!candidate) return false;
	if (hasReadOnlyReferenceIntent(inputText) || hasReadOnlyReferenceIntent(lastGoalText)) {
		return false;
	}
	if (candidate.reasons.some((reason) =>
		reason === "repo path mentioned in input"
			|| reason === "repo-relative directory path exists in candidate"
			|| reason === "repo-relative file path exists in candidate")) {
		return true;
	}
	return (
		(candidate.reasons.includes("repo name mentioned in input") && hasCrossRepoActionIntent(inputText))
		|| (candidate.reasons.includes("repo work intent mentioned in goal") && hasCrossRepoActionIntent(lastGoalText))
	);
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
	const lastGoalText = input.lastGoalText ?? "";
	const rankedCandidates = rankCandidates(input, input.candidates, input.inputText, input.currentRepoRoot, lastGoalText);
	const explicitRepo = findExplicitRepoMention(rankedCandidates, input.inputText);
	const currentRepoCandidate = input.currentRepoRoot
		? rankedCandidates.find((candidate) => candidate.repoRoot === input.currentRepoRoot)
		: undefined;
	const selectedRepo = explicitRepo && hasStrongMismatchEvidence(explicitRepo, input.inputText, lastGoalText)
		? explicitRepo
		: rankedCandidates[0];

	let state: ContextAssessment["state"] = "healthy";
	if (!input.currentRepoRoot) {
		state = "uncertain";
	} else if (explicitRepo && explicitRepo.repoRoot !== input.currentRepoRoot && hasStrongMismatchEvidence(explicitRepo, input.inputText, lastGoalText)) {
		state = "mismatch";
	} else if (
		selectedRepo
		&& selectedRepo.repoRoot !== input.currentRepoRoot
		&& selectedRepo.score >= 60
		&& hasStrongMismatchEvidence(selectedRepo, input.inputText, lastGoalText)
	) {
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
	const normalized = stripLeadingReadOnlyShellWrappers(command).toLowerCase();
	if (!normalized) return true;
	if (["&&", "||", ";", ">", "<", " rm ", " mv ", " cp ", " chmod ", " chown "].some((token) => normalized.includes(token))) {
		return false;
	}
	return READ_ONLY_PREFIXES.some((prefix) => normalized === prefix.trim() || normalized.startsWith(prefix));
}
