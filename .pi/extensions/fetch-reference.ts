import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const TOOL_NAME = "fetch_reference";
const COMMAND_NAME = "fetch-reference";
const CACHE_ROOT = ".pi/remote-refs";
const MAX_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 15_000;
const ALLOWED_HOSTS = new Set(["raw.githubusercontent.com", "github.com"]);

const FetchReferenceParams = Type.Object({
	url: Type.String({
		description:
			"HTTPS reference URL to fetch. Only explicit allowlisted hosts are supported in this spike (currently raw.githubusercontent.com and github.com blob URLs).",
	}),
});

interface MaterializedReference {
	originalUrl: string;
	normalizedUrl: string;
	cacheKey: string;
	bodyPath: string;
	relativeBodyPath: string;
	provenancePath: string;
	relativeProvenancePath: string;
	contentType: string;
	byteLength: number;
	sha256: string;
	fetchedAt: string;
	normalization: string[];
}

function normalizeReferenceUrl(input: string): { normalizedUrl: string; normalization: string[] } {
	let parsed: URL;
	try {
		parsed = new URL(input);
	} catch {
		throw new Error(`Invalid URL: ${input}`);
	}

	if (parsed.protocol !== "https:") {
		throw new Error(`Only HTTPS references are allowed: ${input}`);
	}

	if (!ALLOWED_HOSTS.has(parsed.hostname)) {
		throw new Error(
			`Host not allowlisted for constrained reference fetch: ${parsed.hostname}. Allowed hosts: ${Array.from(ALLOWED_HOSTS).join(", ")}`,
		);
	}

	const normalization: string[] = [];

	if (parsed.hostname === "github.com") {
		const parts = parsed.pathname.split("/").filter(Boolean);
		if (parts.length >= 5 && parts[2] === "blob") {
			const [owner, repo, _blob, ref, ...rest] = parts;
			parsed = new URL(`https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${rest.join("/")}`);
			normalization.push("github blob URL normalized to raw.githubusercontent.com");
		} else {
			throw new Error(
				`Only GitHub blob references are supported for github.com URLs in this spike: ${input}`,
			);
		}
	}

	if (parsed.hostname !== "raw.githubusercontent.com") {
		throw new Error(`Normalized URL is not on an allowlisted raw host: ${parsed.toString()}`);
	}

	return { normalizedUrl: parsed.toString(), normalization };
}

function ensureTextLikeContentType(contentType: string): void {
	const normalized = contentType.toLowerCase();
	const allowed = [
		"text/",
		"application/json",
		"application/javascript",
		"application/typescript",
		"application/x-typescript",
		"application/xml",
		"application/yaml",
		"application/x-yaml",
		"application/octet-stream",
	];

	if (!allowed.some((prefix) => normalized.startsWith(prefix))) {
		throw new Error(`Fetched content type is not allowed for text-only spike: ${contentType}`);
	}
}

function deriveFileName(referenceUrl: string, cacheKey: string): string {
	const parsed = new URL(referenceUrl);
	const rawName = basename(parsed.pathname) || "reference.txt";
	const safeBase = rawName.replace(/[^a-zA-Z0-9._-]/g, "-") || "reference.txt";
	const extension = extname(safeBase) || ".txt";
	const stem = safeBase.slice(0, safeBase.length - extension.length) || "reference";
	return `${stem}-${cacheKey.slice(0, 12)}${extension}`;
}

async function materializeReference(url: string, cwd: string, signal?: AbortSignal): Promise<MaterializedReference> {
	const { normalizedUrl, normalization } = normalizeReferenceUrl(url);
	const cacheKey = createHash("sha256").update(normalizedUrl).digest("hex");
	const dir = join(cwd, CACHE_ROOT, cacheKey.slice(0, 2), cacheKey);
	const fileName = deriveFileName(normalizedUrl, cacheKey);
	const bodyPath = join(dir, fileName);
	const relativeBodyPath = join(CACHE_ROOT, cacheKey.slice(0, 2), cacheKey, fileName);
	const provenancePath = join(dir, `${fileName}.provenance.json`);
	const relativeProvenancePath = join(CACHE_ROOT, cacheKey.slice(0, 2), cacheKey, `${fileName}.provenance.json`);

	await mkdir(dir, { recursive: true });

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(new Error(`Fetch timed out after ${FETCH_TIMEOUT_MS}ms`)), FETCH_TIMEOUT_MS);
	const abortFromCaller = () => controller.abort(new Error("Fetch aborted"));
	signal?.addEventListener("abort", abortFromCaller, { once: true });

	try {
		const response = await fetch(normalizedUrl, {
			signal: controller.signal,
			headers: {
				"User-Agent": "pi-helmsman-fetch-reference/0.1",
				Accept: "text/plain, text/markdown, text/*, application/json;q=0.9, */*;q=0.1",
			},
		});

		if (!response.ok) {
			throw new Error(`Fetch failed with ${response.status} ${response.statusText}`);
		}

		const declaredLength = response.headers.get("content-length");
		if (declaredLength) {
			const parsedLength = Number.parseInt(declaredLength, 10);
			if (Number.isFinite(parsedLength) && parsedLength > MAX_BYTES) {
				throw new Error(`Remote content length ${parsedLength} exceeds ${MAX_BYTES} byte limit`);
			}
		}

		const contentType = response.headers.get("content-type") ?? "text/plain";
		ensureTextLikeContentType(contentType);

		const buffer = Buffer.from(await response.arrayBuffer());
		if (buffer.byteLength > MAX_BYTES) {
			throw new Error(`Fetched content exceeds ${MAX_BYTES} byte limit after download (${buffer.byteLength} bytes)`);
		}

		const body = buffer.toString("utf8");
		const sha256 = createHash("sha256").update(buffer).digest("hex");
		const fetchedAt = new Date().toISOString();

		const provenance = {
			version: 1,
			originalUrl: url,
			normalizedUrl,
			fetchedAt,
			contentType,
			byteLength: buffer.byteLength,
			sha256,
			cacheKey,
			bodyPath,
			relativeBodyPath,
			provenancePath,
			relativeProvenancePath,
			normalization,
			constraints: {
				maxBytes: MAX_BYTES,
				fetchTimeoutMs: FETCH_TIMEOUT_MS,
				allowedHosts: Array.from(ALLOWED_HOSTS),
				mode: "text-only-spike",
			},
		};

		await writeFile(bodyPath, body, "utf8");
		await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, "utf8");

		return {
			originalUrl: url,
			normalizedUrl,
			cacheKey,
			bodyPath,
			relativeBodyPath,
			provenancePath,
			relativeProvenancePath,
			contentType,
			byteLength: buffer.byteLength,
			sha256,
			fetchedAt,
			normalization,
		};
	} finally {
		clearTimeout(timeout);
		signal?.removeEventListener("abort", abortFromCaller);
	}
}

function formatSummary(reference: MaterializedReference): string {
	const normalizationLine =
		reference.normalization.length > 0
			? `Normalization: ${reference.normalization.join("; ")}`
			: "Normalization: none";

	return [
		`Fetched constrained reference: ${reference.normalizedUrl}`,
		`Local file: ${reference.relativeBodyPath}`,
		`Provenance: ${reference.relativeProvenancePath}`,
		`Content-Type: ${reference.contentType}`,
		`Bytes: ${reference.byteLength}`,
		`SHA-256: ${reference.sha256}`,
		normalizationLine,
	].join("\n");
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
			const reference = await materializeReference(params.url, ctx.cwd, signal);
			return {
				content: [{ type: "text", text: formatSummary(reference) }],
				details: reference,
			};
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

			try {
				const reference = await materializeReference(url, ctx.cwd);
				const summary = formatSummary(reference);
				ctx.ui.notify(`Fetched reference into ${reference.bodyPath}`, "success");
				pi.sendMessage({
					customType: TOOL_NAME,
					content: summary,
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
		},
	});
}
