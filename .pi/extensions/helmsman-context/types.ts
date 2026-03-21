export interface RepoCandidate {
	repoRoot: string;
	repoName: string;
	hasBeads: boolean;
	isCurrent: boolean;
	score: number;
	reasons: string[];
}

export type ContextState = "healthy" | "uncertain" | "mismatch";

export interface ContextAssessment {
	state: ContextState;
	workspaceRoot: string;
	currentRepoRoot?: string;
	selectedRepo?: RepoCandidate;
	suggestedFolder?: string;
	blockMutations: boolean;
	summary: string;
	candidates: RepoCandidate[];
}

export interface AssessContextInput {
	workspaceRoot: string;
	currentRepoRoot?: string;
	inputText: string;
	lastGoalText?: string;
	workspaceEvidenceText?: string;
	candidates: RepoCandidate[];
}
