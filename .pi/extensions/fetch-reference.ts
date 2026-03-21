import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { COMMAND_NAME, TOOL_NAME } from "./fetch-reference/config.js";
import { formatSummary, materializeReference } from "./fetch-reference/materialize.js";

const FetchReferenceParams = Type.Object({
	url: Type.String({
		description:
			"HTTPS reference URL to fetch. Only explicit allowlisted hosts and repositories are supported for constrained materialization.",
	}),
});

async function fetchForTool(url: string, cwd: string, signal?: AbortSignal) {
	const reference = await materializeReference(url, cwd, signal);
	return {
		content: [{ type: "text" as const, text: formatSummary(reference) }],
		details: reference,
	};
}

async function fetchForCommand(pi: ExtensionAPI, url: string, ctx: any) {
	try {
		const reference = await materializeReference(url, ctx.cwd);
		ctx.ui.notify(`Fetched reference into ${reference.bodyPath}`, "success");
		pi.sendMessage({
			customType: TOOL_NAME,
			content: formatSummary(reference),
			details: reference,
			display: true,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(`Fetch reference failed: ${message}`, "error");
		pi.sendMessage({
			customType: TOOL_NAME,
			content: `Fetch reference failed for ${url}\n${message}`,
			display: true,
		});
	}
}

export default function fetchReferenceExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: TOOL_NAME,
		label: "Fetch Reference",
		description:
			"Fetch a constrained remote HTTPS reference from an allowlisted host, materialize it into a local readable file, and record provenance metadata beside it.",
		promptSnippet:
			"Fetch an allowlisted remote reference into a local file with provenance, then inspect the local materialized path with read.",
		promptGuidelines: [
			"Use this tool only for allowlisted remote references that need local read inspection.",
			"After fetching, use the returned local path and provenance path for normal read flows instead of refetching.",
		],
		parameters: FetchReferenceParams,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			return fetchForTool(params.url, ctx.cwd, signal);
		},
	});

	pi.registerCommand(COMMAND_NAME, {
		description: "Fetch an allowlisted reference URL into .pi/remote-refs with provenance",
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
