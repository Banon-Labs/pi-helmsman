import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { detectSuggestedFolder } from "./folders.ts";

function makeRepoRoot(): string {
	return mkdtempSync(join(tmpdir(), "helmsman-folders-"));
}

describe("detectSuggestedFolder", () => {
	test("extracts an absolute in-repo folder path from the goal text", () => {
		const repoRoot = makeRepoRoot();
		const docsDir = join(repoRoot, "packages/coding-agent/docs");
		mkdirSync(docsDir, { recursive: true });

		const result = detectSuggestedFolder({
			targetRepoRoot: repoRoot,
			inputText: `work in ${docsDir} next`,
		});

		expect(result?.path).toBe(docsDir);
		expect(result?.source).toBe("absolute");
		expect(result?.basis).toBe("directory");
	});

	test("extracts a repo-relative folder hint from the goal text", () => {
		const repoRoot = makeRepoRoot();
		const srcDir = join(repoRoot, "packages/coding-agent/src/core");
		mkdirSync(srcDir, { recursive: true });

		const result = detectSuggestedFolder({
			targetRepoRoot: repoRoot,
			inputText: "focus on packages/coding-agent/src/core for the follow-up",
		});

		expect(result?.path).toBe(srcDir);
		expect(result?.source).toBe("relative");
		expect(result?.basis).toBe("directory");
	});

	test("uses the parent folder when the goal mentions an absolute in-repo file path", () => {
		const repoRoot = makeRepoRoot();
		const docsDir = join(repoRoot, "packages/coding-agent/docs");
		const filePath = join(docsDir, "extensions.md");
		mkdirSync(docsDir, { recursive: true });
		writeFileSync(filePath, "# docs\n");

		const result = detectSuggestedFolder({
			targetRepoRoot: repoRoot,
			inputText: `update ${filePath} and keep going there`,
		});

		expect(result?.path).toBe(docsDir);
		expect(result?.source).toBe("absolute");
		expect(result?.basis).toBe("file-parent");
	});

	test("uses the parent folder when the goal mentions a repo-relative file path", () => {
		const repoRoot = makeRepoRoot();
		const docsDir = join(repoRoot, "packages/coding-agent/docs");
		const filePath = join(docsDir, "extensions.md");
		mkdirSync(docsDir, { recursive: true });
		writeFileSync(filePath, "# docs\n");

		const result = detectSuggestedFolder({
			targetRepoRoot: repoRoot,
			inputText: "update packages/coding-agent/docs/extensions.md and keep going there",
		});

		expect(result?.path).toBe(docsDir);
		expect(result?.source).toBe("relative");
		expect(result?.basis).toBe("file-parent");
	});

	test("returns undefined when no folder hint is present", () => {
		const repoRoot = makeRepoRoot();
		const result = detectSuggestedFolder({
			targetRepoRoot: repoRoot,
			inputText: "continue current task",
		});

		expect(result).toBeUndefined();
	});
});
