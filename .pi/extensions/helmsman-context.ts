import { dirname } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolCallEvent } from "@mariozechner/pi-coding-agent";
import { assessDirtyWorktree, formatDirtyWorktreeAssessment, type DirtyWorktreeAssessment } from "./helmsman-context/dirty.js";
import { collectWorkspaceEvidence } from "./helmsman-context/evidence.js";
import { discoverRepoCandidates, findRepoRoot } from "./helmsman-context/filesystem.js";
import { detectSuggestedFolder } from "./helmsman-context/folders.js";
import { chooseRouteGoal, shouldTrackAsGoal } from "./helmsman-context/goal.js";
import { assessContext, isReadOnlyBashCommand } from "./helmsman-context/heuristics.js";
import { resolveParkedWorkflowTargets } from "./helmsman-context/parking.js";
import { buildContextRoutePlan } from "./helmsman-context/route.js";
import {
	chooseSelectableCandidates,
	formatSelectableCandidateDetails,
	formatSelectableCandidateLabel,
	shouldPromptForRepoSelection,
} from "./helmsman-context/selection.js";
import {
	buildContextDirectBashBlockOutput,
	buildContextGuardMessage,
	buildContextMutationBlockReason,
	buildContextRouteNotice,
	buildContextSwitchUnavailableNotice,
	buildDirtyWorktreeGuardMessage,
	buildDirtyWorktreeMutationBlockReason,
} from "./helmsman-context/messages.js";
import { restoreTrackedGoal } from "./helmsman-context/state.js";
import { createDefaultWorkflowState, restoreWorkflowState, updateWorkflowPlanScaffold } from "./helmsman-workflow/state.js";
import type { ContextAssessment } from "./helmsman-context/types.js";

const COMMAND_NAME = "context";
const SWITCH_COMMAND_NAME = "context-switch";
const CUSTOM_TYPE = "helmsman-context";
const READ_ONLY_CUSTOM_TOOLS = new Set(["fetch_reference", "fetch_web", "search_web", "questionnaire"]);
export const CONTINUATION_ROUTE_MARKER = "[Helmsman continuation route]";

function getWorkspaceRoot(cwd: string): string {
	const repoRoot = findRepoRoot(cwd);
	return dirname(repoRoot ?? cwd);
}

export function getConfidencePercent(score: number): number {
	return Math.max(0, Math.min(100, score));
}

export function getConfidenceLabel(score: number): string {
	const percent = getConfidencePercent(score);
	if (percent < 50) return `${percent}% (low confidence)`;
	if (percent < 80) return `${percent}% (medium confidence)`;
	return `${percent}% (high confidence)`;
}

export function formatAssessment(assessment: ContextAssessment): string {
	const candidateLines = assessment.candidates
		.slice(0, 5)
		.map((candidate, index) => {
			const markers = [candidate.isCurrent ? "current" : undefined, candidate.hasBeads ? ".beads" : undefined]
				.filter(Boolean)
				.join(", ");
			const details = [markers || undefined, candidate.reasons.join(", ") || undefined].filter(Boolean).join("; ");
			return `${index + 1}. ${candidate.repoName} (${candidate.repoRoot}) confidence=${getConfidenceLabel(candidate.score)} score=${candidate.score}${details ? ` — ${details}` : ""}`;
		})
		.join("\n");

	return [
		`State: ${assessment.state}`,
		`Summary: ${assessment.summary}`,
		`Decision: ${assessment.decisionExplanation ?? "none"}`,
		`Workspace root: ${assessment.workspaceRoot}`,
		`Current repo: ${assessment.currentRepoRoot ?? "unresolved"}`,
		`Selected repo: ${assessment.selectedRepo?.repoRoot ?? "none"}`,
		`Suggested folder: ${assessment.suggestedFolder ?? "none"}`,
		`Suggested folder source: ${assessment.suggestedFolderSource ?? "none"}`,
		`Suggested folder basis: ${assessment.suggestedFolderBasis ?? "none"}`,
		`Block mutations: ${assessment.blockMutations ? "yes" : "no"}`,
		"Candidates:",
		candidateLines || "(none)",
	].join("\n");
}

export function formatRoutePlan(command: string, handoffPrompt: string): string {
	return [
		"Explicit context-correction flow:",
		`1. Run: ${command}`,
		"2. In the target repo session, continue with this prompt:",
		CONTINUATION_ROUTE_MARKER,
		handoffPrompt,
	].join("\n");
}

function uniqueStrings(items: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const item of items) {
		const trimmed = item.trim();
		if (!trimmed || seen.has(trimmed)) continue;
		seen.add(trimmed);
		result.push(trimmed);
	}
	return result;
}

function updateStatus(ctx: ExtensionContext, assessment: ContextAssessment | undefined): void {
	if (!assessment) {
		ctx.ui.setStatus("helmsman-context", ctx.ui.theme.fg("warning", "ctx:unknown"));
		return;
	}
	if (assessment.state === "healthy") {
		ctx.ui.setStatus("helmsman-context", ctx.ui.theme.fg("success", `ctx:${assessment.selectedRepo?.repoName ?? "ok"}`));
		return;
	}
	ctx.ui.setStatus("helmsman-context", ctx.ui.theme.fg("warning", `ctx:${assessment.state}`));
}

async function computeAssessment(
	cwd: string,
	inputText: string,
	lastGoalText: string,
	sessionPath?: string,
): Promise<ContextAssessment> {
	const currentRepoRoot = findRepoRoot(cwd);
	const workspaceRoot = getWorkspaceRoot(cwd);
	const candidates = await discoverRepoCandidates(workspaceRoot, currentRepoRoot);
	const workspaceEvidenceText = collectWorkspaceEvidence({ sessionPath }).text;
	return assessContext({ workspaceRoot, currentRepoRoot, inputText, lastGoalText, workspaceEvidenceText, candidates });
}

function isMutatingToolCall(event: ToolCallEvent): boolean {
	if (event.toolName === "edit" || event.toolName === "write") return true;
	if (event.toolName === "bash") {
		return !isReadOnlyBashCommand(String((event.input as { command?: string }).command ?? ""));
	}
	if (event.toolName === "read" || event.toolName === "grep" || event.toolName === "find" || event.toolName === "ls") {
		return false;
	}
	return !READ_ONLY_CUSTOM_TOOLS.has(event.toolName);
}

export default function helmsmanContextExtension(pi: ExtensionAPI) {
	let lastAssessment: ContextAssessment | undefined;
	let lastDirtyWorktree: DirtyWorktreeAssessment | undefined;
	let lastInputText = "";
	let lastGoalText = "";

	async function refreshDirtyWorktree(ctx: ExtensionContext): Promise<DirtyWorktreeAssessment> {
		const repoRoot = findRepoRoot(ctx.cwd);
		if (!repoRoot) {
			lastDirtyWorktree = assessDirtyWorktree("", []);
			return lastDirtyWorktree;
		}
		const workflowState = restoreWorkflowState(
			ctx.sessionManager.getBranch() as Array<{ type: string; customType?: string; data?: unknown }>,
		);
		const goalScopedTargets = lastGoalText.trim()
			? updateWorkflowPlanScaffold(createDefaultWorkflowState(), lastGoalText).plan.targetFiles
			: [];
		const activeTargets = uniqueStrings([...workflowState.plan.targetFiles, ...goalScopedTargets]);
		const result = await pi.exec("git", ["status", "--short", "--untracked-files=all"], { cwd: repoRoot });
		const stashListResult = await pi.exec("git", ["stash", "list", "--format=%gd\t%s"], { cwd: repoRoot });
		const traceableParking = resolveParkedWorkflowTargets(activeTargets, stashListResult.stdout, "");
		let parkedTargets = traceableParking.parkedTargetFiles;
		if (traceableParking.parkedStash) {
			const stashShowResult = await pi.exec(
				"git",
				["stash", "show", "--name-only", "--format=", traceableParking.parkedStash.ref],
				{ cwd: repoRoot },
			);
			const parkedResolution = resolveParkedWorkflowTargets(
				activeTargets,
				stashListResult.stdout,
				stashShowResult.stdout,
			);
			parkedTargets = parkedResolution.parkedTargetFiles;
		}
		lastDirtyWorktree = assessDirtyWorktree(result.stdout, uniqueStrings([...activeTargets, ...parkedTargets]));
		return lastDirtyWorktree;
	}

	async function refreshAssessment(ctx: ExtensionContext, inputText = lastInputText) {
		lastInputText = inputText;
		lastAssessment = await computeAssessment(ctx.cwd, inputText, lastGoalText, ctx.sessionManager.getSessionFile());
		await refreshDirtyWorktree(ctx);
		updateStatus(ctx, lastAssessment);
		return lastAssessment;
	}

	function restoreState(ctx: ExtensionContext): void {
		lastGoalText = restoreTrackedGoal(ctx.sessionManager.getBranch() as Array<{ type: string; customType?: string; data?: { lastGoalText?: string } }>);
	}

	function persistTrackedGoal(): void {
		if (!lastGoalText.trim()) return;
		pi.appendEntry("helmsman-context-state", { lastGoalText });
	}

	pi.on("session_start", async (_event, ctx) => {
		restoreState(ctx);
		await refreshAssessment(ctx, "");
	});

	pi.on("session_tree", async (_event, ctx) => {
		restoreState(ctx);
		await refreshAssessment(ctx, lastInputText);
	});

	pi.on("input", async (event, ctx) => {
		if (event.source !== "extension" && shouldTrackAsGoal(event.text)) {
			lastGoalText = event.text.trim();
			persistTrackedGoal();
		}
		await refreshAssessment(ctx, event.text);
		return { action: "continue" as const };
	});

	pi.on("before_agent_start", async (_event, ctx) => {
		const assessment = lastAssessment ?? (await refreshAssessment(ctx, lastInputText));
		const dirtyWorktree = lastDirtyWorktree ?? (await refreshDirtyWorktree(ctx));
		if (dirtyWorktree.blocksMutation) {
			return {
				message: {
					customType: CUSTOM_TYPE,
					content: buildDirtyWorktreeGuardMessage(dirtyWorktree),
					display: false,
				},
			};
		}
		if (assessment.state === "healthy") return;
		return {
			message: {
				customType: CUSTOM_TYPE,
				content: buildContextGuardMessage(assessment),
				display: false,
			},
		};
	});

	pi.on("tool_call", async (event, ctx) => {
		const assessment = lastAssessment ?? (await refreshAssessment(ctx, lastInputText));
		const dirtyWorktree = lastDirtyWorktree ?? (await refreshDirtyWorktree(ctx));
		if (!isMutatingToolCall(event)) return;
		if (dirtyWorktree.blocksMutation) {
			return {
				block: true,
				reason: buildDirtyWorktreeMutationBlockReason(dirtyWorktree),
			};
		}
		if (!assessment.blockMutations) return;
		return {
			block: true,
			reason: buildContextMutationBlockReason(assessment.summary, COMMAND_NAME),
		};
	});

	pi.on("user_bash", async (event, ctx) => {
		const assessment = lastAssessment ?? (await refreshAssessment(ctx, lastInputText));
		const dirtyWorktree = lastDirtyWorktree ?? (await refreshDirtyWorktree(ctx));
		if (isReadOnlyBashCommand(event.command)) return;
		if (dirtyWorktree.blocksMutation) {
			return {
				result: {
					output: buildDirtyWorktreeMutationBlockReason(dirtyWorktree),
					exitCode: 1,
					cancelled: false,
					truncated: false,
				},
			};
		}
		if (!assessment.blockMutations) return;
		return {
			result: {
				output: buildContextDirectBashBlockOutput(assessment.summary, COMMAND_NAME),
				exitCode: 1,
				cancelled: false,
				truncated: false,
			},
		};
	});

	pi.registerCommand(COMMAND_NAME, {
		description: "Inspect Helmsman repo-context assessment and candidate routing",
		handler: async (args, ctx) => {
			const assessment = await refreshAssessment(ctx, args.trim() || lastInputText);
			const dirtyWorktree = lastDirtyWorktree ?? (await refreshDirtyWorktree(ctx));
			const content = [formatAssessment(assessment), "", "Dirty worktree:", formatDirtyWorktreeAssessment(dirtyWorktree)].join("\n");
			ctx.ui.notify(dirtyWorktree.blocksMutation ? dirtyWorktree.summary : assessment.summary, dirtyWorktree.blocksMutation || assessment.state !== "healthy" ? "warning" : "info");
			pi.sendMessage({
				customType: CUSTOM_TYPE,
				content,
				details: assessment,
				display: true,
			});
		},
	});

	pi.registerCommand(SWITCH_COMMAND_NAME, {
		description: "Show an explicit repo-correction route using pi --fork for traceable handoff",
		handler: async (args, ctx) => {
			const explicitTarget = args.trim();
			const routeHint = explicitTarget || lastInputText;
			const assessment = await refreshAssessment(ctx, routeHint);
			const selectableCandidates = chooseSelectableCandidates(assessment.candidates);
			let selectedRepo = assessment.selectedRepo;

			if (
				ctx.hasUI &&
				shouldPromptForRepoSelection({
					hasExplicitTarget: explicitTarget.length > 0,
					selectableCandidates,
				})
			) {
				pi.sendMessage({
					customType: CUSTOM_TYPE,
					content: formatSelectableCandidateDetails(selectableCandidates),
					details: selectableCandidates,
					display: true,
				});
				const options = selectableCandidates.map((candidate) => formatSelectableCandidateLabel(candidate));
				const choice = await ctx.ui.select("Choose target repo", options);
				selectedRepo = selectableCandidates.find((candidate) => formatSelectableCandidateLabel(candidate) === choice);
			}

			const sessionFile = ctx.sessionManager.getSessionFile();
			const routeGoal = chooseRouteGoal(args, lastGoalText, lastInputText);
			const routeFolderHint = selectedRepo
				? detectSuggestedFolder({
						targetRepoRoot: selectedRepo.repoRoot,
						inputText: routeGoal,
					})
				: undefined;
			const routedAssessment = selectedRepo
				? {
					...assessment,
					selectedRepo,
					suggestedFolder: routeFolderHint?.path ?? assessment.suggestedFolder,
					suggestedFolderSource: routeFolderHint?.source ?? assessment.suggestedFolderSource,
					suggestedFolderBasis: routeFolderHint?.basis ?? assessment.suggestedFolderBasis,
				}
				: assessment;
			const routePlan = buildContextRoutePlan({
				assessment: routedAssessment,
				sessionFile,
				lastInputText: routeGoal,
			});
			if (!routePlan) {
				ctx.ui.notify(buildContextSwitchUnavailableNotice(), "warning");
				return;
			}

			const content = formatRoutePlan(routePlan.command, routePlan.handoffPrompt);
			ctx.ui.notify(buildContextRouteNotice(routePlan.targetRepoRoot), "info");
			pi.sendMessage({
				customType: CUSTOM_TYPE,
				content,
				details: routePlan,
				display: true,
			});
		},
	});
}
