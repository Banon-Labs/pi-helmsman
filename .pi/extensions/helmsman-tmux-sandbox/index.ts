import { Type, StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	appendAndPublishSandboxRun,
	createSandboxRunDetails,
	gatherSandboxRequestFromCommand,
	runSandboxScenario,
} from "./runtime.js";
import { SANDBOX_SCENARIOS, type SandboxRunRequest } from "./scenario.js";

export const HELMSMAN_TMUX_SANDBOX_COMMAND = "tmux-sandbox";
export const HELMSMAN_TMUX_SANDBOX_TOOL = "helmsman_tmux_sandbox";
export const HELMSMAN_TMUX_SANDBOX_RUN_TYPE = "helmsman-tmux-sandbox-run";

const SandboxRunSchema = Type.Object({
	scenario: StringEnum(SANDBOX_SCENARIOS),
	prompt: Type.Optional(Type.String({ description: "Prompt text for the cli-smoke scenario" })),
	session: Type.Optional(Type.String({ description: "tmux session name" })),
	sandboxRoot: Type.Optional(Type.String({ description: "Optional sandbox root directory" })),
	captureOut: Type.Optional(Type.String({ description: "Optional capture file path" })),
	waitSeconds: Type.Optional(Type.Number({ description: "Post-submit wait time in seconds" })),
	noMirrorHostState: Type.Optional(Type.Boolean({ description: "Skip mirroring host Pi agent state" })),
	query: Type.Optional(Type.String({ description: "Query for the web-grounding scenario" })),
	limit: Type.Optional(Type.Number({ description: "Result limit for the web-grounding scenario" })),
	noDemo: Type.Optional(Type.Boolean({ description: "Skip auto-running the web-grounding demo command" })),
});

export default function helmsmanTmuxSandboxExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: HELMSMAN_TMUX_SANDBOX_TOOL,
		label: "Helmsman tmux sandbox",
		description: "Run a Pi-native tmux sandbox scenario for Helmsman smoke testing and runtime validation.",
		parameters: SandboxRunSchema,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const request = params as SandboxRunRequest;
			const outcome = await runSandboxScenario(pi, ctx.cwd, request);
			const details = createSandboxRunDetails(request, outcome);
			pi.appendEntry(HELMSMAN_TMUX_SANDBOX_RUN_TYPE, details);
			return {
				content: [{ type: "text", text: outcome.code === 0 ? `tmux sandbox ${request.scenario} completed` : `tmux sandbox ${request.scenario} failed` }],
				details,
			};
		},
	});

	pi.registerCommand(HELMSMAN_TMUX_SANDBOX_COMMAND, {
		description: "Run a Helmsman tmux sandbox scenario through a Pi-native command",
		handler: async (args, ctx) => {
			const request = await gatherSandboxRequestFromCommand(args, ctx);
			if (!request) {
				ctx.ui.notify("tmux sandbox cancelled", "info");
				return;
			}
			const outcome = await runSandboxScenario(pi, ctx.cwd, request);
			const details = createSandboxRunDetails(request, outcome);
			await appendAndPublishSandboxRun(pi, ctx, details, HELMSMAN_TMUX_SANDBOX_RUN_TYPE);
		},
	});
}

export { SANDBOX_SCENARIOS } from "./scenario.js";
export {
	buildScenarioArgs,
	createSandboxRoot,
	createSandboxSessionName,
	parseScenarioChoice,
	parseSandboxRunOutput,
	type ParsedSandboxRun,
	type SandboxRunRequest,
	type SandboxScenario,
} from "./scenario.js";
