import { dirname } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolCallEvent } from "@mariozechner/pi-coding-agent";
import { collectWorkspaceEvidence } from "./helmsman-context/evidence.js";
import { discoverRepoCandidates, findRepoRoot } from "./helmsman-context/filesystem.js";
import { detectSuggestedFolder } from "./helmsman-context/folders.js";
import { chooseRouteGoal, shouldTrackAsGoal } from "./helmsman-context/goal.js";
import { assessContext, isReadOnlyBashCommand } from "./helmsman-context/heuristics.js";
import { buildContextRoutePlan } from "./helmsman-context/route.js";
import {
	chooseSelectableCandidates,
	formatSelectableCandidateDetails,
	formatSelectableCandidateLabel,
	shouldPromptForRepoSelection,
} from "./helmsman-context/selection.js";
import { restoreTrackedGoal } from "./helmsman-context/state.js";
import type { ContextAssessment } from "./helmsman-context/types.js";

const COMMAND_NAME = "context";
const SWITCH_COMMAND_NAME = "context-switch";
const CUSTOM_TYPE = "helmsman-context";
const READ_ONLY_CUSTOM_TOOLS = new Set(["fetch_reference", "questionnaire"]);

function getWorkspaceRoot(cwd: string): string {
	const repoRoot = findRepoRoot(cwd);
	return dirname(repoRoot ?? cwd);
}

function formatAssessment(assessment: ContextAssessment): string {
	const candidateLines = assessment.candidates
		.slice(0, 5)
		.map((candidate, index) => {
			const markers = [candidate.isCurrent ? "current" : undefined, candidate.hasBeads ? ".beads" : undefined]
				.filter(Boolean)
				.join(", ");
			const details = [markers || undefined, candidate.reasons.join(", ") || undefined].filter(Boolean).join("; ");
			return `${index + 1}. ${candidate.repoName} (${candidate.repoRoot}) score=${candidate.score}${details ? ` — ${details}` : ""}`;
		})
		.join("\n");

	return [
		`State: ${assessment.state}`,
		`Summary: ${assessment.summary}`,
		`Workspace root: ${assessment.workspaceRoot}`,
		`Current repo: ${assessment.currentRepoRoot ?? "unresolved"}`,
		`Selected repo: ${assessment.selectedRepo?.repoRoot ?? "none"}`,
		`Suggested folder: ${assessment.suggestedFolder ?? "none"}`,
		`Suggested folder source: ${assessment.suggestedFolderSource ?? "none"}`,
		`Block mutations: ${assessment.blockMutations ? "yes" : "no"}`,
		"Candidates:",
		candidateLines || "(none)",
	].join("\n");
}

function formatRoutePlan(command: string, handoffPrompt: string): string {
	return [
		"Explicit context-correction flow:",
		`1. Run: ${command}`,
		"2. In the target repo session, continue with this prompt:",
		handoffPrompt,
	].join("\n");
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
	let lastInputText = "";
	let lastGoalText = "";

	async function refreshAssessment(ctx: ExtensionContext, inputText = lastInputText) {
		lastInputText = inputText;
		lastAssessment = await computeAssessment(ctx.cwd, inputText, lastGoalText, ctx.sessionManager.getSessionFile());
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
		if (shouldTrackAsGoal(event.text)) {
			lastGoalText = event.text.trim();
			persistTrackedGoal();
		}
		await refreshAssessment(ctx, event.text);
		return { action: "continue" as const };
	});

	pi.on("before_agent_start", async (_event, ctx) => {
		const assessment = lastAssessment ?? (await refreshAssessment(ctx, lastInputText));
		if (assessment.state === "healthy") return;
		return {
			message: {
				customType: CUSTOM_TYPE,
				content: `[HELMSMAN CONTEXT ${assessment.state.toUpperCase()}]\n${assessment.summary}\nDo not mutate files or issue trackers until repo context is resolved. You may continue with read-only investigation only and should recommend /context for inspection or an explicit repo switch request.`,
				display: false,
			},
		};
	});

	pi.on("tool_call", async (event, ctx) => {
		const assessment = lastAssessment ?? (await refreshAssessment(ctx, lastInputText));
		if (!assessment.blockMutations) return;
		if (!isMutatingToolCall(event)) return;
		return {
			block: true,
			reason: `${assessment.summary}. Mutating tools are blocked until context is resolved. Use /${COMMAND_NAME} to inspect candidates and stay in read-only investigation mode.`,
		};
	});

	pi.on("user_bash", async (event, ctx) => {
		const assessment = lastAssessment ?? (await refreshAssessment(ctx, lastInputText));
		if (!assessment.blockMutations) return;
		if (isReadOnlyBashCommand(event.command)) return;
		return {
			result: {
				output: `${assessment.summary}. Direct bash mutation blocked until context is resolved. Use /${COMMAND_NAME} and restrict investigation to read-only commands.`,
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
			const content = formatAssessment(assessment);
			ctx.ui.notify(assessment.summary, assessment.state === "healthy" ? "info" : "warning");
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
			const routedAssessment = selectedRepo
				? {
					...assessment,
					selectedRepo,
					suggestedFolder:
						detectSuggestedFolder({
							targetRepoRoot: selectedRepo.repoRoot,
							inputText: routeGoal,
						})?.path ?? assessment.suggestedFolder,
					suggestedFolderSource:
						detectSuggestedFolder({
							targetRepoRoot: selectedRepo.repoRoot,
							inputText: routeGoal,
						})?.source ?? assessment.suggestedFolderSource,
				}
				: assessment;
			const routePlan = buildContextRoutePlan({
				assessment: routedAssessment,
				sessionFile,
				lastInputText: routeGoal,
			});
			if (!routePlan) {
				ctx.ui.notify("No target repo available for context correction", "warning");
				return;
			}

			const content = formatRoutePlan(routePlan.command, routePlan.handoffPrompt);
			ctx.ui.notify(`Route to ${routePlan.targetRepoRoot}`, "info");
			pi.sendMessage({
				customType: CUSTOM_TYPE,
				content,
				details: routePlan,
				display: true,
			});
		},
	});
}
