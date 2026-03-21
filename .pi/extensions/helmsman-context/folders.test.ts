import { describe, expect, test } from "bun:test";
import { detectSuggestedFolder } from "./folders.ts";

describe("detectSuggestedFolder", () => {
	test("extracts an absolute in-repo folder path from the goal text", () => {
		const result = detectSuggestedFolder({
			targetRepoRoot: "/home/choza/projects/pi-mono",
			inputText: "work in /home/choza/projects/pi-mono/packages/coding-agent/docs next",
		});

		expect(result).toBe("/home/choza/projects/pi-mono/packages/coding-agent/docs");
	});

	test("extracts a repo-relative folder hint from the goal text", () => {
		const result = detectSuggestedFolder({
			targetRepoRoot: "/home/choza/projects/pi-mono",
			inputText: "focus on packages/coding-agent/src/core for the follow-up",
		});

		expect(result).toBe("/home/choza/projects/pi-mono/packages/coding-agent/src/core");
	});

	test("returns undefined when no folder hint is present", () => {
		const result = detectSuggestedFolder({
			targetRepoRoot: "/home/choza/projects/pi-mono",
			inputText: "continue current task",
		});

		expect(result).toBeUndefined();
	});
});
