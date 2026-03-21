import { dirname } from "node:path";
import type { ExtensionAPI, ExtensionContext, ToolCallEvent } from "@mariozechner/pi-coding-agent";
import { assessContext, isReadOnlyBashCommand } from "./helmsman-context/heuristics.js";
import { discoverRepoCandidates, findRepoRoot } from "./helmsman-context/filesystem.js";
import { buildContextRoutePlan } from "./helmsman-context/route.js";
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

async function computeAssessment(cwd: string, inputText: string): Promise<ContextAssessment> {
	const currentRepoRoot = findRepoRoot(cwd);
	const workspaceRoot = getWorkspaceRoot(cwd);
	const candidates = await discoverRepoCandidates(workspaceRoot, currentRepoRoot);
	return assessContext({ workspaceRoot, currentRepoRoot, inputText, candidates });
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

	async function refreshAssessment(ctx: ExtensionContext, inputText = lastInputText) {
		lastInputText = inputText;
		lastAssessment = await computeAssessment(ctx.cwd, inputText);
		updateStatus(ctx, lastAssessment);
		return lastAssessment;
	}

	pi.on("session_start", async (_event, ctx) => {
		await refreshAssessment(ctx, "");
	});

	pi.on("session_tree", async (_event, ctx) => {
		await refreshAssessment(ctx, lastInputText);
	});

	pi.on("input", async (event, ctx) => {
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
			const assessment = await refreshAssessment(ctx, args.trim() || lastInputText);
			const sessionFile = ctx.sessionManager.getSessionFile();
			const routePlan = buildContextRoutePlan({
				assessment,
				sessionFile,
				lastInputText,
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
