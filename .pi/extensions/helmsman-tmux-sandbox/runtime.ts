import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import {
	buildScenarioArgs,
	parseSandboxRunOutput,
	parseScenarioChoice,
	type ParsedSandboxRun,
	type SandboxRunRequest,
	type SandboxScenario,
	SANDBOX_SCENARIOS,
} from "./scenario.js";

export interface SandboxRunOutcome {
	output: string;
	parsed: ParsedSandboxRun;
	code: number;
}

export interface SandboxRunDetails extends SandboxRunOutcome {
	scenario: SandboxScenario;
	request: SandboxRunRequest;
}

function scenarioDisplayName(scenario: SandboxScenario): string {
	switch (scenario) {
		case "cli-smoke":
			return "CLI smoke";
		case "selection":
			return "repo-selection";
		case "web-grounding":
			return "web-grounding";
	}
}

export async function runSandboxScenario(pi: ExtensionAPI, cwd: string, request: SandboxRunRequest): Promise<SandboxRunOutcome> {
	const scriptArgs = buildScenarioArgs(request);
	const { stdout, stderr, code } = await pi.exec("bash", scriptArgs, { cwd });
	const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
	return { output: output || stdout || stderr || "", parsed: parseSandboxRunOutput(stdout), code: code ?? 1 };
}

export function createSandboxRunDetails(request: SandboxRunRequest, outcome: SandboxRunOutcome): SandboxRunDetails {
	return {
		...outcome,
		scenario: request.scenario,
		request,
	};
}

export function formatSandboxRunMessage(details: SandboxRunDetails): string {
	return [
		`Scenario: ${details.scenario}`,
		details.parsed.session ? `Session: ${details.parsed.session}` : undefined,
		details.parsed.sandboxRoot ? `Sandbox: ${details.parsed.sandboxRoot}` : undefined,
		details.parsed.captureOut ? `Capture: ${details.parsed.captureOut}` : undefined,
		`Exit code: ${details.code}`,
		"",
		details.output || "(no output)",
	].filter(Boolean).join("\n");
}

export async function chooseSandboxScenario(ctx: ExtensionCommandContext): Promise<SandboxScenario | undefined> {
	if (!ctx.hasUI) return undefined;
	const options = SANDBOX_SCENARIOS.map((scenario) => `${scenarioDisplayName(scenario)} (${scenario})`);
	const choice = await ctx.ui.select("Choose tmux sandbox scenario", options);
	return SANDBOX_SCENARIOS.find((scenario, index) => options[index] === choice);
}

export async function gatherSandboxRequestFromCommand(args: string, ctx: ExtensionCommandContext): Promise<SandboxRunRequest | undefined> {
	const parsed = parseScenarioChoice(args.split(/\s+/)[0]);
	const scenario = parsed ?? (await chooseSandboxScenario(ctx));
	if (!scenario) return undefined;

	if (scenario === "cli-smoke") {
		const prompt = args.includes(" ") ? args.slice(args.indexOf(" ") + 1).trim() : undefined;
		const promptText = prompt || (ctx.hasUI ? (await ctx.ui.input("tmux sandbox prompt", "Prompt to submit"))?.trim() : undefined);
		return { scenario, prompt: promptText || "continue current task" };
	}

	if (scenario === "selection") {
		return { scenario };
	}

	const query = ctx.hasUI ? (await ctx.ui.input("web-grounding query", "Discovery query"))?.trim() : undefined;
	return { scenario, query: query || "rfc 9110 http semantics" };
}

export async function appendAndPublishSandboxRun(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	details: SandboxRunDetails,
	runType: string,
): Promise<void> {
	pi.appendEntry(runType, details);
	if (ctx.hasUI) {
		ctx.ui.notify(
			details.code === 0 ? `tmux sandbox ${details.scenario} completed` : `tmux sandbox ${details.scenario} failed`,
			details.code === 0 ? "info" : "warning",
		);
	}
	pi.sendMessage({
		customType: runType,
		content: formatSandboxRunMessage(details),
		details,
		display: true,
	});
}
