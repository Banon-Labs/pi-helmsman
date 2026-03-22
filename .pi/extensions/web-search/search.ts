import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	CACHE_ROOT,
	DEFAULT_LIMIT,
	FETCH_TIMEOUT_MS,
	MAX_LIMIT,
	POLICY_VERSION,
	PROVIDER,
	SEARCH_BASE_URL,
} from "./config.js";
import type { MaterializedWebSearch, WebSearchResult } from "./types.js";

function decodeHtmlEntities(text: string): string {
	return text
		.replace(/&nbsp;/gi, " ")
		.replace(/&amp;/gi, "&")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;/gi, "'");
}

function stripTags(text: string): string {
	return decodeHtmlEntities(text.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function unwrapDuckDuckGoUrl(candidate: string): string {
	try {
		const parsed = new URL(candidate, SEARCH_BASE_URL);
		if (parsed.hostname === "duckduckgo.com" && parsed.pathname === "/l/") {
			const uddg = parsed.searchParams.get("uddg");
			if (uddg) return decodeURIComponent(uddg);
		}
		return parsed.toString();
	} catch {
		return candidate;
	}
}

export function extractSearchResults(html: string, limit = DEFAULT_LIMIT): WebSearchResult[] {
	const results: WebSearchResult[] = [];
	const blockPattern = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
	let match: RegExpExecArray | null;

	while ((match = blockPattern.exec(html)) && results.length < limit) {
		const [, rawUrl, rawTitle] = match;
		const title = stripTags(rawTitle);
		const url = unwrapDuckDuckGoUrl(decodeHtmlEntities(rawUrl));
		if (!title || !url.startsWith("https://")) continue;

		const searchWindow = html.slice(match.index, match.index + 1500);
		const snippetMatch = searchWindow.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
			?? searchWindow.match(/<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
		const snippet = snippetMatch ? stripTags(snippetMatch[1]) : undefined;
		results.push({
			title,
			url,
			snippet,
			rank: results.length + 1,
		});
	}

	return results;
}

function createFetchController(signal?: AbortSignal): { controller: AbortController; cleanup: () => void } {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(new Error(`Search timed out after ${FETCH_TIMEOUT_MS}ms`)), FETCH_TIMEOUT_MS);
	const abortFromCaller = () => controller.abort(new Error("Search aborted"));
	signal?.addEventListener("abort", abortFromCaller, { once: true });
	return {
		controller,
		cleanup: () => {
			clearTimeout(timeout);
			signal?.removeEventListener("abort", abortFromCaller);
		},
	};
}

function buildPaths(cwd: string, query: string) {
	const cacheKey = createHash("sha256").update(query).digest("hex");
	const dir = join(cwd, CACHE_ROOT, cacheKey.slice(0, 2), cacheKey);
	const fileName = `search-${cacheKey.slice(0, 12)}.json`;
	return {
		cacheKey,
		dir,
		bodyPath: join(dir, fileName),
		relativeBodyPath: join(CACHE_ROOT, cacheKey.slice(0, 2), cacheKey, fileName),
		provenancePath: join(dir, `${fileName}.provenance.json`),
		relativeProvenancePath: join(CACHE_ROOT, cacheKey.slice(0, 2), cacheKey, `${fileName}.provenance.json`),
	};
}

export async function materializeWebSearch(
	query: string,
	cwd: string,
	options?: { limit?: number; signal?: AbortSignal },
): Promise<MaterializedWebSearch> {
	const limit = Math.min(Math.max(options?.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
	const searchUrl = `${SEARCH_BASE_URL}?q=${encodeURIComponent(query)}`;
	const { controller, cleanup } = createFetchController(options?.signal);
	try {
		const response = await fetch(searchUrl, {
			signal: controller.signal,
			headers: {
				"User-Agent": "Mozilla/5.0 (compatible; pi-helmsman-web-search/0.1)",
				Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
			},
		});
		if (!response.ok) throw new Error(`Search failed with ${response.status} ${response.statusText}`);
		const html = await response.text();
		const results = extractSearchResults(html, limit);
		const paths = buildPaths(cwd, `${query}\nlimit=${limit}`);
		await mkdir(paths.dir, { recursive: true });
		const materialized: MaterializedWebSearch = {
			query,
			provider: PROVIDER,
			searchUrl,
			cacheKey: paths.cacheKey,
			resultCount: results.length,
			results,
			bodyPath: paths.bodyPath,
			relativeBodyPath: paths.relativeBodyPath,
			provenancePath: paths.provenancePath,
			relativeProvenancePath: paths.relativeProvenancePath,
			fetchedAt: new Date().toISOString(),
			policyVersion: POLICY_VERSION,
		};
		await writeFile(materialized.bodyPath, `${JSON.stringify(materialized, null, 2)}\n`, "utf8");
		await writeFile(
			materialized.provenancePath,
			`${JSON.stringify(
				{
					version: 1,
					provider: PROVIDER,
					policyVersion: POLICY_VERSION,
					query,
					searchUrl,
					limit,
					resultCount: results.length,
					bodyPath: materialized.bodyPath,
					relativeBodyPath: materialized.relativeBodyPath,
					provenancePath: materialized.provenancePath,
					relativeProvenancePath: materialized.relativeProvenancePath,
					fetchedAt: materialized.fetchedAt,
					constraints: { maxLimit: MAX_LIMIT, fetchTimeoutMs: FETCH_TIMEOUT_MS },
				},
				null,
				2,
			)}\n`,
			"utf8",
		);
		return materialized;
	} finally {
		cleanup();
	}
}

export function formatSearchSummary(search: MaterializedWebSearch): string {
	return [
		`Web search query: ${search.query}`,
		`Provider: ${search.provider}`,
		`Policy version: ${search.policyVersion}`,
		`Search URL: ${search.searchUrl}`,
		`Results: ${search.resultCount}`,
		`Local file: ${search.relativeBodyPath}`,
		`Provenance: ${search.relativeProvenancePath}`,
		"",
		"Top results:",
		search.results.length
			? search.results
					.map((result) => `${result.rank}. ${result.title}\n   ${result.url}${result.snippet ? `\n   ${result.snippet}` : ""}`)
					.join("\n")
			: "(no results found)",
	].join("\n");
}
