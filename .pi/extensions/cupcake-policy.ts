import type { ExtensionAPI, ExtensionContext, ToolCallEvent } from "@mariozechner/pi-coding-agent";
import {
	CUPCAKE_COMMAND_NAME,
	CUPCAKE_CUSTOM_TYPE,
	CUPCAKE_STATUS_KEY,
	formatCupcakeBridgeConfig,
	resolveCupcakeBridgeConfig,
} from "./cupcake-policy/config.js";
import {
	buildCupcakeToolCallEvent,
	buildCupcakeToolResultEvent,
	buildCupcakeUserBashEvent,
} from "./cupcake-policy/events.js";
import { enforceCupcakeDecision, loadCupcakeRuntime, type CupcakeRuntime } from "./cupcake-policy/runtime.js";

function updateStatus(ctx: ExtensionContext, runtime: CupcakeRuntime): void {
	ctx.ui.setStatus(CUPCAKE_STATUS_KEY, ctx.ui.theme.fg(runtime.ready ? "success" : "warning", `cp:${runtime.ready ? "on" : "off"}`));
}

function buildStatusMessage(configText: string, runtime: CupcakeRuntime): string {
	return `${configText}\nRuntime: ${runtime.description}\nReady: ${runtime.ready ? "yes" : "no"}`;
}

function buildBlockReason(reason?: string): string {
	return `Cupcake policy blocked this action.${reason ? ` ${reason}` : ""}`;
}

function buildBashResult(reason?: string) {
	return {
		output: buildBlockReason(reason),
		exitCode: 1,
		cancelled: false,
		truncated: false,
	};
}

export default function cupcakePolicyExtension(pi: ExtensionAPI) {
	const config = resolveCupcakeBridgeConfig();
	let runtime: CupcakeRuntime = {
		ready: false,
		description: "not initialized",
		async evaluate() {
			return undefined;
		},
	};

	async function ensureRuntime(ctx?: ExtensionContext): Promise<CupcakeRuntime> {
		if (runtime.description !== "not initialized") return runtime;
		runtime = await loadCupcakeRuntime(config);
		if (ctx) updateStatus(ctx, runtime);
		return runtime;
	}

	async function evaluateAndEnforce(reasonFallback: string, event: Parameters<CupcakeRuntime["evaluate"]>[0]) {
		const activeRuntime = await ensureRuntime();
		const decision = await activeRuntime.evaluate(event);
		return enforceCupcakeDecision(decision, config.failMode, `${reasonFallback}: ${activeRuntime.description}`);
	}

	pi.on("session_start", async (_event, ctx) => {
		await ensureRuntime(ctx);
	});

	pi.on("tool_call", async (event: ToolCallEvent, ctx) => {
		const enforcement = await evaluateAndEnforce(
			"Cupcake runtime unavailable during tool-call policy check",
			buildCupcakeToolCallEvent({
				toolName: event.toolName,
				input: event.input as Record<string, unknown>,
				cwd: ctx.cwd,
			}),
		);
		if (enforcement.allow) return;
		return {
			block: true,
			reason: buildBlockReason(enforcement.reason),
		};
	});

	pi.on("user_bash", async (event, ctx) => {
		const enforcement = await evaluateAndEnforce(
			"Cupcake runtime unavailable during bash policy check",
			buildCupcakeUserBashEvent({ command: event.command, cwd: ctx.cwd }),
		);
		if (enforcement.allow) return;
		return {
			result: buildBashResult(enforcement.reason),
		};
	});

	pi.on("tool_result", async (event, ctx) => {
		const enforcement = await evaluateAndEnforce(
			"Cupcake runtime unavailable during post-tool policy check",
			buildCupcakeToolResultEvent({
				toolName: event.toolName,
				input: event.input as Record<string, unknown>,
				cwd: ctx.cwd,
				isError: event.isError,
				output: event.output,
				exitCode: event.exitCode,
				cancelled: event.cancelled,
				truncated: event.truncated,
			}),
		);
		if (enforcement.allow || !enforcement.reason) return;
		ctx.ui.notify(`Cupcake post-tool policy warning: ${enforcement.reason}`, enforcement.severity);
	});

	pi.registerCommand(CUPCAKE_COMMAND_NAME, {
		description: "Show optional Cupcake bridge configuration and runtime status",
		handler: async (_args, ctx) => {
			const activeRuntime = await ensureRuntime(ctx);
			const content = buildStatusMessage(formatCupcakeBridgeConfig(config), activeRuntime);
			ctx.ui.notify(`Cupcake bridge ${activeRuntime.ready ? "ready" : "inactive"}`, activeRuntime.ready ? "info" : "warning");
			pi.sendMessage({
				customType: CUPCAKE_CUSTOM_TYPE,
				content,
				details: { config, runtime: activeRuntime },
				display: true,
			});
		},
	});
}
