import type { RepoCandidate } from "./types.js";

export interface WorkspaceEvidenceInput {
	issueText?: string;
	sessionPath?: string;
}

export function collectWorkspaceEvidence(input: WorkspaceEvidenceInput): { text: string } {
	return {
		text: [input.issueText?.trim(), input.sessionPath?.trim()].filter(Boolean).join("\n"),
	};
}

export function scoreCandidateWithWorkspaceEvidence(candidate: RepoCandidate, evidenceText: string): RepoCandidate {
	if (!evidenceText.toLowerCase().includes(candidate.repoName.toLowerCase())) {
		return candidate;
	}
	return {
		...candidate,
		score: candidate.score + 30,
		reasons: [...candidate.reasons, "repo evidence mentioned in issue/session context"],
	};
}
