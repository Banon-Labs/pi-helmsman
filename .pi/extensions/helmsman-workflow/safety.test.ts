import { describe, expect, test } from "bun:test";
import {
	getBashSafetyPrompt,
	getPlanModeBashBlockReason,
	getProtectedPathPrompt,
	getUnexpectedFileSpreadReason,
	isPathCoveredByTargets,
	isProtectedPath,
} from "./safety";

describe("isProtectedPath", () => {
	test("flags common sensitive repo paths", () => {
		expect(isProtectedPath(".env")).toBe(true);
		expect(isProtectedPath(".git/config")).toBe(true);
		expect(isProtectedPath("node_modules/pkg/index.js")).toBe(true);
		expect(isProtectedPath(".beads/issues.jsonl")).toBe(true);
	});

	test("does not flag normal source paths", () => {
		expect(isProtectedPath("src/index.ts")).toBe(false);
		expect(isProtectedPath("testing/pi-cli-smoke.sh")).toBe(false);
	});
});

describe("getProtectedPathPrompt", () => {
	test("returns a confirmation prompt for protected paths", () => {
		const prompt = getProtectedPathPrompt(".git/config");

		expect(prompt?.kind).toBe("protected-path");
		expect(prompt?.title).toContain("protected-path");
		expect(prompt?.message).toContain(".git/config");
	});
});

describe("getBashSafetyPrompt", () => {
	test("classifies delete-oriented commands", () => {
		const prompt = getBashSafetyPrompt("rm -rf tmp-output");

		expect(prompt?.kind).toBe("file-delete");
		expect(prompt?.title).toContain("file deletion");
	});

	test("classifies destructive git commands", () => {
		const prompt = getBashSafetyPrompt("git reset --hard HEAD~1");

		expect(prompt?.kind).toBe("destructive-git");
		expect(prompt?.reason).toContain("Destructive git");
	});

	test("classifies destructive non-git shell commands", () => {
		const prompt = getBashSafetyPrompt("chmod -R 777 dist");

		expect(prompt?.kind).toBe("destructive-bash");
		expect(prompt?.reason).toContain("Destructive bash");
	});

	test("allows low-risk repo-local mv in build mode when it stays within target scope", () => {
		expect(
			getBashSafetyPrompt("mv src/old.ts src/new.ts", {
				mode: "build",
				targetFiles: ["src/old.ts", "src/new.ts"],
			}),
		).toBeUndefined();
	});

	test("still prompts for mv when it touches protected or out-of-scope paths", () => {
		const protectedMove = getBashSafetyPrompt("mv src/index.ts .git/index", {
			mode: "build",
			targetFiles: ["src/index.ts"],
		});
		const outOfScopeMove = getBashSafetyPrompt("mv src/index.ts scripts/index.ts", {
			mode: "build",
			targetFiles: ["src/index.ts"],
		});
		const unscopedMove = getBashSafetyPrompt("mv src/index.ts src/renamed.ts", {
			mode: "build",
			targetFiles: [],
		});

		expect(protectedMove?.kind).toBe("destructive-bash");
		expect(outOfScopeMove?.kind).toBe("destructive-bash");
		expect(unscopedMove?.kind).toBe("destructive-bash");
	});

	test("ignores read-only commands", () => {
		expect(getBashSafetyPrompt("git status --short --branch")).toBeUndefined();
		expect(getBashSafetyPrompt("rg helmsman . -n")).toBeUndefined();
	});
});

describe("getPlanModeBashBlockReason", () => {
	test("allows read-only exploration commands", () => {
		expect(getPlanModeBashBlockReason("git status --short --branch")).toBeUndefined();
		expect(getPlanModeBashBlockReason("find ./.pi/extensions -maxdepth 2 -type f")).toBeUndefined();
	});

	test("blocks mutating shell commands in plan mode", () => {
		expect(getPlanModeBashBlockReason("rm -rf tmp-output")).toContain("Plan mode stays read-only");
		expect(getPlanModeBashBlockReason("git reset --hard HEAD~1")).toContain("approved plan");
	});
});

describe("unexpected file spread detection", () => {
	test("treats matching relative and absolute-ish repo paths as in scope", () => {
		expect(isPathCoveredByTargets("./.pi/extensions/helmsman-workflow.ts", [".pi/extensions/helmsman-workflow.ts"]))
			.toBe(true);
		expect(isPathCoveredByTargets("/home/choza/projects/pi-helmsman/.pi/extensions/helmsman-workflow.ts", [
			".pi/extensions/helmsman-workflow.ts",
		])).toBe(true);
	});

	test("flags edits outside the approved target file set", () => {
		expect(getUnexpectedFileSpreadReason("testing/pi-cli-smoke.sh", [".pi/extensions/helmsman-workflow.ts"]))
			.toContain("I’m returning to plan mode");
	});

	test("does not flag in-scope paths or empty target lists", () => {
		expect(getUnexpectedFileSpreadReason("testing/pi-cli-smoke.sh", ["testing/pi-cli-smoke.sh"])).toBeUndefined();
		expect(getUnexpectedFileSpreadReason("testing/pi-cli-smoke.sh", [])).toBeUndefined();
	});
});
