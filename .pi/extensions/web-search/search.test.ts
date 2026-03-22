import { describe, expect, test } from "bun:test";
import { extractSearchResults, formatSearchSummary } from "./search.ts";

describe("extractSearchResults", () => {
	test("parses duckduckgo-style result blocks and unwraps redirected urls", () => {
		const html = `
		<div class="result">
		  <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.rfc-editor.org%2Frfc%2Frfc9110.txt">HTTP Semantics</a>
		  <a class="result__snippet">Internet Engineering Task Force RFC 9110 text.</a>
		</div>
		<div class="result">
		  <a class="result__a" href="https://developer.mozilla.org/en-US/docs/Web/HTTP">MDN HTTP</a>
		  <div class="result__snippet">HTTP documentation from MDN.</div>
		</div>`;

		const results = extractSearchResults(html, 5);
		expect(results).toHaveLength(2);
		expect(results[0]).toEqual({
			title: "HTTP Semantics",
			url: "https://www.rfc-editor.org/rfc/rfc9110.txt",
			snippet: "Internet Engineering Task Force RFC 9110 text.",
			rank: 1,
		});
		expect(results[1]?.url).toBe("https://developer.mozilla.org/en-US/docs/Web/HTTP");
	});
});

describe("formatSearchSummary", () => {
	test("renders ranked candidate results with local artifact paths", () => {
		const summary = formatSearchSummary({
			query: "rfc 9110 http semantics",
			provider: "duckduckgo-html",
			searchUrl: "https://duckduckgo.com/html/?q=rfc%209110",
			cacheKey: "abc",
			resultCount: 1,
			results: [
				{
					title: "HTTP Semantics",
					url: "https://www.rfc-editor.org/rfc/rfc9110.txt",
					snippet: "Internet Engineering Task Force RFC 9110 text.",
					rank: 1,
				},
			],
			bodyPath: "/tmp/search.json",
			relativeBodyPath: ".pi/web-searches/ab/search.json",
			provenancePath: "/tmp/search.json.provenance.json",
			relativeProvenancePath: ".pi/web-searches/ab/search.json.provenance.json",
			fetchedAt: "2026-03-22T00:00:00.000Z",
			policyVersion: 1,
		});

		expect(summary).toContain("Web search query: rfc 9110 http semantics");
		expect(summary).toContain("1. HTTP Semantics");
		expect(summary).toContain(".pi/web-searches/ab/search.json");
	});
});
