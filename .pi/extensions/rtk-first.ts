import {
	createBashTool,
	createLocalBashOperations,
	type ExtensionAPI,
} from "@mariozechner/pi-coding-agent";
import {
	buildRtkInputRewriteText,
	buildRtkUserBashNotice,
	getRtkEquivalent,
	looksLikeBareInspectionPrompt,
} from "./rtk-first/policy.js";
import { createRtkSpawnHook, createRtkStatusSnapshot, formatRtkStatusReport, rewriteModeSeverity } from "./rtk-first/rewrite.js";

const SYSTEM_PROMPT_APPEND = `Prefer RTK wrapper commands for read-only inspection whenever an RTK equivalent exists. In this workspace: file reads should use rtk read; git inspection should prefer rtk git status/diff/log/show/branch; search and discovery should prefer rtk find, rtk grep, and rtk ls. Only fall back to native read-only shell commands when RTK lacks the needed behavior.`;

export default function rtkFirstExtension(pi: ExtensionAPI) {
	const cwd = process.cwd();
	const bashTool = createBashTool(cwd, {
		spawnHook: createRtkSpawnHook(),
	});

	pi.registerTool({
		...bashTool,
		async execute(toolCallId, params, signal, onUpdate, _ctx) {
			return bashTool.execute(toolCallId, params, signal, onUpdate);
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
		const rewrite = getRtkEquivalent(event.text);
		if (!rewrite) return { action: "continue" as const };
		ctx.ui.notify(buildRtkUserBashNotice(rewrite), "info");
		return {
			action: "transform" as const,
			text: buildRtkInputRewriteText(rewrite),
			images: event.images,
		};
	});

	pi.on("user_bash", async (event, ctx) => {
		const rewrite = getRtkEquivalent(event.command);
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
		description: "Show whether RTK-backed bash rewriting is active or safely falling back to normal bash execution",
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
