import { describe, expect, test } from "bun:test";
import { assessDirtyWorktree, classifyDirtyPath, formatDirtyWorktreeAssessment, parseGitStatusPorcelain } from "./dirty";

describe("parseGitStatusPorcelain", () => {
	test("parses tracked, untracked, and rename entries", () => {
		expect(
			parseGitStatusPorcelain([" M .pi/extensions/helmsman-context.ts", "?? .opencode/", "R  old.ts -> new.ts"].join("\n")),
		).toEqual([
			{ path: ".pi/extensions/helmsman-context.ts", kind: "tracked", rawStatus: " M" },
			{ path: ".opencode/", kind: "untracked", rawStatus: "??" },
			{ path: "new.ts", kind: "tracked", rawStatus: "R " },
		]);
	});
});

describe("classifyDirtyPath", () => {
	test("classifies in-scope, transient, and unrelated paths", () => {
		expect(classifyDirtyPath(".pi/extensions/helmsman-context.ts", [".pi/extensions/helmsman-context.ts"]))
			.toBe("in-scope");
		expect(classifyDirtyPath(".opencode/session.json", [".pi/extensions/helmsman-context.ts"]))
			.toBe("transient");
		expect(classifyDirtyPath("README.md", [".pi/extensions/helmsman-context.ts"]))
			.toBe("unrelated");
	});
});

describe("assessDirtyWorktree", () => {
	test("blocks mutation when unrelated dirty paths remain", () => {
		const assessment = assessDirtyWorktree(
			[" M .pi/extensions/helmsman-context.ts", " M .pi/extensions/smart-voice-notify.ts", "?? .opencode/"].join("\n"),
			[".pi/extensions/helmsman-context.ts"],
		);

		expect(assessment.inScopeEntries.map((entry) => entry.path)).toEqual([".pi/extensions/helmsman-context.ts"]);
		expect(assessment.blockingEntries.map((entry) => entry.path)).toEqual([".pi/extensions/smart-voice-notify.ts"]);
		expect(assessment.transientEntries.map((entry) => entry.path)).toEqual([".opencode/"]);
		expect(assessment.blocksMutation).toBe(true);
		expect(assessment.summary).toContain("1 unrelated, 1 in-scope, 1 transient");
	});

	test("does not block when dirty paths are only in-scope or transient", () => {
		const assessment = assessDirtyWorktree(
			[" M .pi/extensions/helmsman-context.ts", "?? .cupcake/"].join("\n"),
			[".pi/extensions/helmsman-context.ts"],
		);

		expect(assessment.blocksMutation).toBe(false);
		expect(assessment.blockingEntries).toEqual([]);
	});

	test("formats categorized dirty-path details for /context output", () => {
		const rendered = formatDirtyWorktreeAssessment(
			assessDirtyWorktree(
				[" M .pi/extensions/helmsman-context.ts", " M .pi/extensions/smart-voice-notify.ts", "?? .opencode/"].join("\n"),
				[".pi/extensions/helmsman-context.ts"],
			),
		);

		expect(rendered).toContain("Blocking paths:");
		expect(rendered).toContain("smart-voice-notify.ts");
		expect(rendered).toContain("In-scope paths:");
		expect(rendered).toContain("helmsman-context.ts");
		expect(rendered).toContain("Transient paths:");
		expect(rendered).toContain(".opencode/");
	});
});
