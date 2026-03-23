import { describe, expect, test } from "bun:test";
import { findTraceableParkedStash, parseStashFileList, parseStashList, resolveParkedWorkflowTargets } from "./parking";

describe("parking helpers", () => {
	test("parses stash refs and messages", () => {
		const entries = parseStashList([
			"stash@{0}\tOn main: pi-helmsman-l81 / helmsman dirty-worktree park",
			"stash@{1}\tOn main: unrelated note",
		].join("\n"));

		expect(entries).toEqual([
			{ ref: "stash@{0}", message: "On main: pi-helmsman-l81 / helmsman dirty-worktree park" },
			{ ref: "stash@{1}", message: "On main: unrelated note" },
		]);
		expect(findTraceableParkedStash(entries)).toEqual({
			ref: "stash@{0}",
			message: "On main: pi-helmsman-l81 / helmsman dirty-worktree park",
		});
	});

	test("parses stash file lists and merges parked files into active targets", () => {
		const files = parseStashFileList([
			".pi/extensions/helmsman-workflow.ts",
			".pi/extensions/helmsman-workflow/handoff.ts",
			"",
			".pi/extensions/helmsman-workflow/state.ts",
		].join("\n"));

		expect(files).toEqual([
			".pi/extensions/helmsman-workflow.ts",
			".pi/extensions/helmsman-workflow/handoff.ts",
			".pi/extensions/helmsman-workflow/state.ts",
		]);

		const resolution = resolveParkedWorkflowTargets(
			[".pi/extensions/helmsman-workflow.ts"],
			"stash@{0}\tOn main: pi-helmsman-l81 / helmsman dirty-worktree park",
			files.join("\n"),
		);

		expect(resolution.parkedStash?.ref).toBe("stash@{0}");
		expect(resolution.parkedPlan?.goal).toContain("stash@{0}");
		expect(resolution.targetFiles).toEqual([
			".pi/extensions/helmsman-workflow.ts",
			".pi/extensions/helmsman-workflow/handoff.ts",
			".pi/extensions/helmsman-workflow/state.ts",
		]);
	});
});
