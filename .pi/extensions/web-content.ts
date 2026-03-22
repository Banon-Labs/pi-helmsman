import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { COMMAND_NAME, TOOL_NAME } from "./web-content/config.js";
import { formatSummary, materializeWebContent } from "./web-content/materialize.js";

const FetchWebParams = Type.Object({
	url: Type.String({
		description:
			"HTTPS URL for broader web-content fetch. This tool fetches text-first web content, stores the raw body plus provenance locally, and returns a readable preview.",
	}),
});

async function fetchForTool(url: string, cwd: string, signal?: AbortSignal) {
	const reference = await materializeWebContent(url, cwd, signal);
	return {
		content: [{ type: "text" as const, text: formatSummary(reference) }],
		details: reference,
	};
}

async function fetchForCommand(pi: ExtensionAPI, url: string, ctx: any) {
	try {
		const reference = await materializeWebContent(url, ctx.cwd);
		ctx.ui.notify(`Fetched web content into ${reference.bodyPath}`, "success");
		pi.sendMessage({
			customType: TOOL_NAME,
			content: formatSummary(reference),
			details: reference,
			display: true,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(`Fetch web failed: ${message}`, "error");
		pi.sendMessage({
			customType: TOOL_NAME,
			content: `Fetch web failed for ${url}\n${message}`,
			display: true,
		});
	}
}

export default function webContentExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: TOOL_NAME,
		label: "Fetch Web",
		description:
			"Fetch broader HTTPS web content, persist the raw body plus provenance locally, and return a text-first preview for immediate inspection.",
		promptSnippet: "Fetch broader HTTPS web content with a direct preview plus local provenance-backed materialization.",
		promptGuidelines: [
			"Use this tool when broader web content is needed beyond the constrained fetch_reference allowlist.",
			"Prefer the returned preview for quick inspection, and use the local body/provenance paths when deeper local read flows are needed.",
		],
		parameters: FetchWebParams,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			return fetchForTool(params.url, ctx.cwd, signal);
		},
	});

	pi.registerCommand(COMMAND_NAME, {
		description: "Fetch broader HTTPS web content into .pi/web-refs with provenance and preview text",
		handler: async (args, ctx) => {
			const url = args.trim();
			if (!url) {
				ctx.ui.notify(`Usage: /${COMMAND_NAME} <https-url>`, "warning");
				return;
			}

			await fetchForCommand(pi, url, ctx);
		},
	});
}
