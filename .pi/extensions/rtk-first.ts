import {
	createBashTool,
	createFindTool,
	createGrepTool,
	createLocalBashOperations,
	createLsTool,
	createReadTool,
	type ExtensionAPI,
} from "@mariozechner/pi-coding-agent";
import {
	buildRtkInputRewriteText,
	buildRtkUserBashNotice,
	looksLikeBareInspectionPrompt,
	getRtkEquivalent,
} from "./rtk-first/policy.js";
import { createRtkSpawnHook, createRtkStatusSnapshot, formatRtkStatusReport, rewriteCommandWithRtk, rewriteModeSeverity } from "./rtk-first/rewrite.js";
import {
	buildRtkFindToolCommand,
	buildRtkGrepToolCommand,
	buildRtkLsToolCommand,
	buildRtkReadToolCommand,
	executeRtkToolCommand,
} from "./rtk-first/tools.js";

const SYSTEM_PROMPT_APPEND = `Prefer RTK wrapper commands for read-only inspection whenever an RTK equivalent exists. In this workspace: file reads should use rtk read; git inspection should prefer rtk git status/diff/log/show/branch; search and discovery should prefer rtk find, rtk grep, and rtk ls. Only fall back to native read-only shell commands when RTK lacks the needed behavior.`;

export default function rtkFirstExtension(pi: ExtensionAPI) {
	const cwd = process.cwd();
	const bashTool = createBashTool(cwd, {
		spawnHook: createRtkSpawnHook(),
	});
	const readTool = createReadTool(cwd);
	const grepTool = createGrepTool(cwd);
	const findTool = createFindTool(cwd);
	const lsTool = createLsTool(cwd);

	pi.registerTool({
		...bashTool,
		async execute(toolCallId, params, signal, onUpdate, _ctx) {
			return bashTool.execute(toolCallId, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...readTool,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const command = buildRtkReadToolCommand({
				path: String(params.path ?? ""),
				offset: typeof params.offset === "number" ? params.offset : undefined,
				limit: typeof params.limit === "number" ? params.limit : undefined,
			});
			if (command) {
				const result = await executeRtkToolCommand(command, { cwd: ctx.cwd, signal, env: process.env });
				if (result) return { content: [{ type: "text", text: result.output }], details: { rtkBacked: true, command: result.command } };
			}
			return readTool.execute(toolCallId, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...grepTool,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const command = buildRtkGrepToolCommand({
				pattern: String(params.pattern ?? ""),
				path: typeof params.path === "string" ? params.path : undefined,
				glob: typeof params.glob === "string" ? params.glob : undefined,
				ignoreCase: params.ignoreCase === true,
				literal: params.literal === true,
				context: typeof params.context === "number" ? params.context : undefined,
				limit: typeof params.limit === "number" ? params.limit : undefined,
			});
			if (command) {
				const result = await executeRtkToolCommand(command, { cwd: ctx.cwd, signal, env: process.env });
				if (result) return { content: [{ type: "text", text: result.output }], details: { rtkBacked: true, command: result.command } };
			}
			return grepTool.execute(toolCallId, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...findTool,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const command = buildRtkFindToolCommand({
				pattern: String(params.pattern ?? ""),
				path: typeof params.path === "string" ? params.path : undefined,
				limit: typeof params.limit === "number" ? params.limit : undefined,
			});
			if (command) {
				const result = await executeRtkToolCommand(command, { cwd: ctx.cwd, signal, env: process.env });
				if (result) return { content: [{ type: "text", text: result.output }], details: { rtkBacked: true, command: result.command } };
			}
			return findTool.execute(toolCallId, params, signal, onUpdate);
		},
	});

	pi.registerTool({
		...lsTool,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			const command = buildRtkLsToolCommand({
				path: typeof params.path === "string" ? params.path : undefined,
				limit: typeof params.limit === "number" ? params.limit : undefined,
			});
			if (command) {
				const result = await executeRtkToolCommand(command, { cwd: ctx.cwd, signal, env: process.env });
				if (result) return { content: [{ type: "text", text: result.output }], details: { rtkBacked: true, command: result.command } };
			}
			return lsTool.execute(toolCallId, params, signal, onUpdate);
		},
	});

	pi.on("before_agent_start", async (event) => {
		if (!event.prompt.trim()) return;
		return {
			message: {
				customType: "rtk-first",
				content: `[RTK-FIRST INSPECTION]\n${SYSTEM_PROMPT_APPEND}`,
				display: false,
			},
		};
	});

	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") return { action: "continue" as const };
		if (!looksLikeBareInspectionPrompt(event.text)) return { action: "continue" as const };
		const runtimeRewrite = rewriteCommandWithRtk(event.text, { cwd: ctx.cwd, env: process.env });
		const rewrite = runtimeRewrite.status === "rewritten" && runtimeRewrite.command.startsWith("rtk ")
			? { originalCommand: runtimeRewrite.originalCommand, rewrittenCommand: runtimeRewrite.command, kind: getRtkEquivalent(event.text)?.kind ?? "git" as const }
			: getRtkEquivalent(event.text);
		if (!rewrite) return { action: "continue" as const };
		ctx.ui.notify(buildRtkUserBashNotice(rewrite), "info");
		return {
			action: "transform" as const,
			text: buildRtkInputRewriteText(rewrite),
			images: event.images,
		};
	});

	pi.on("user_bash", async (event, ctx) => {
		const runtimeRewrite = rewriteCommandWithRtk(event.command, { cwd: ctx.cwd, env: process.env });
		const rewrite = runtimeRewrite.status === "rewritten" && runtimeRewrite.command.startsWith("rtk ")
			? { originalCommand: runtimeRewrite.originalCommand, rewrittenCommand: runtimeRewrite.command, kind: getRtkEquivalent(event.command)?.kind ?? "git" as const }
			: getRtkEquivalent(event.command);
		if (!rewrite) return;
		ctx.ui.notify(buildRtkUserBashNotice(rewrite), "info");
		const local = createLocalBashOperations();
		return {
			operations: {
				exec: (_command, cwd, options) => local.exec(rewrite.rewrittenCommand, cwd, options),
			},
		};
	});

	pi.registerCommand("rtk-status", {
		description: "Show whether RTK-backed read-only inspection overrides are active or safely falling back to Pi defaults",
		handler: async (_args, ctx) => {
			const snapshot = createRtkStatusSnapshot({ cwd: ctx.cwd, env: process.env });
			const report = formatRtkStatusReport(snapshot);
			if (ctx.hasUI) {
				ctx.ui.notify(report, rewriteModeSeverity(snapshot));
				return;
			}
			console.log(report);
		},
	});
}
