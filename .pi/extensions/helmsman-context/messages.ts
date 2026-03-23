import type { ContextAssessment } from "./types.js";
import type { DirtyWorktreeAssessment } from "./dirty.js";

export function buildContextGuardMessage(assessment: ContextAssessment): string {
	const guidance = assessment.blockMutations
		? "Hold off on mutations and tracker changes until the repo context is confirmed."
		: "This looks like a low-confidence context warning. You can keep going, but it may be worth checking /context if Helmsman seems touchy.";
	return [
		`[HELMSMAN CONTEXT ${assessment.state.toUpperCase()}]`,
		assessment.summary,
		guidance,
		"You can keep investigating with read-only tools, inspect the routing state with /context, or start an explicit repo switch with /context-switch.",
	].join("\n");
}

export function buildContextMutationBlockReason(summary: string, commandName: string): string {
	return `${summary}. I’m blocking mutation until context is confirmed. Use /${commandName} to inspect candidates, then continue in read-only mode or switch repos explicitly.`;
}

export function buildContextDirectBashBlockOutput(summary: string, commandName: string): string {
	return `${summary}. I’m blocking direct bash mutation until context is confirmed. Use /${commandName} to inspect the routing state and keep investigation read-only for now.`;
}

export function buildContextSwitchUnavailableNotice(): string {
	return "I couldn’t identify a confident target repo yet. Use /context to inspect the candidates, then choose the repo you want explicitly.";
}

export function buildContextRouteNotice(targetRepoRoot: string): string {
	return `Prepared a context-correction route into ${targetRepoRoot}. Review it and continue there when you’re ready.`;
}

export function buildDirtyWorktreeGuardMessage(assessment: DirtyWorktreeAssessment): string {
	const blockingPaths = assessment.blockingEntries.slice(0, 5).map((entry) => `- ${entry.path}`).join("\n") || "- none";
	return [
		"[HELMSMAN DIRTY WORKTREE]",
		assessment.summary,
		"Hold off on mutations until unrelated dirty paths are reviewed or cleaned up.",
		"Blocking paths:",
		blockingPaths,
	].join("\n");
}

export function buildDirtyWorktreeMutationBlockReason(assessment: DirtyWorktreeAssessment): string {
	const blockingPaths = assessment.blockingEntries.slice(0, 3).map((entry) => entry.path).join(", ");
	return `${assessment.summary} I’m blocking mutation until unrelated dirty paths are reviewed: ${blockingPaths || "none"}.`;
}
