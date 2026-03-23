import { describe, expect, test } from "bun:test";
import { buildClarifiedGoal, getClarificationChoices, getClarificationQuestion, shouldClarifyGoal } from "./clarify";

describe("shouldClarifyGoal", () => {
	test("flags short ambiguous requests", () => {
		expect(shouldClarifyGoal("fix it")).toBe(true);
	});

	test("does not flag concrete file-targeted requests", () => {
		expect(shouldClarifyGoal("Update .pi/extensions/helmsman-workflow.ts to add plan scaffolding")).toBe(false);
	});

	test("does not flag longer specific requests", () => {
		expect(shouldClarifyGoal("Add structured planner state with phase output and target file hints")).toBe(false);
	});
});

describe("clarification prompts", () => {
	test("offers two suggested narrowing paths plus an exact Something else escape hatch", () => {
		const choices = getClarificationChoices("fix it");
		expect(choices).toHaveLength(3);
		expect(choices[0]).toContain("intended outcome");
		expect(choices[1]).toContain("files or repo area");
		expect(choices[2]).toBe("Something else");
	});

	test("asks for typed follow-up only after the Something else branch", () => {
		const question = getClarificationQuestion("fix it");
		expect(question).toContain("outcome");
		expect(question).toContain("files");
		expect(question).not.toContain("1.");
		expect(question).not.toContain("Something else");
	});
});

describe("buildClarifiedGoal", () => {
	test("merges original goal with clarification answer", () => {
		expect(buildClarifiedGoal("fix it", "Update .pi/extensions/helmsman-workflow.ts and keep the change scoped"))
			.toBe("fix it\n\nClarification: Update .pi/extensions/helmsman-workflow.ts and keep the change scoped");
	});

	test("returns original goal when clarification is empty", () => {
		expect(buildClarifiedGoal("fix it", "   ")).toBe("fix it");
	});
});
