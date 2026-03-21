import { describe, expect, test } from "bun:test";
import { normalizeReferenceUrl } from "./policy.ts";

describe("normalizeReferenceUrl", () => {
	test("normalizes allowlisted GitHub blob URLs to raw content URLs", () => {
		const result = normalizeReferenceUrl(
			"https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md",
		);

		expect(result).toEqual({
			normalizedUrl:
				"https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md",
			normalization: ["github blob URL normalized to raw.githubusercontent.com"],
			sourceKind: "github-blob",
		});
	});

	test("accepts allowlisted raw GitHub content URLs", () => {
		const result = normalizeReferenceUrl(
			"https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md",
		);

		expect(result).toEqual({
			normalizedUrl:
				"https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md",
			normalization: [],
			sourceKind: "github-raw",
		});
	});

	test("rejects repositories outside the explicit allowlist", () => {
		expect(() =>
			normalizeReferenceUrl(
				"https://github.com/octocat/Hello-World/blob/main/README.md",
			),
		).toThrow(/Repository not allowlisted/);
	});
});
