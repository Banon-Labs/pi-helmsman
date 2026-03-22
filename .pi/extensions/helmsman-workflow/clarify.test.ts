import { describe, expect, test } from "bun:test";
import { buildClarifiedGoal, getClarificationQuestion, shouldClarifyGoal } from "./clarify";

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

describe("getClarificationQuestion", () => {
	test("asks for outcome and likely files", () => {
		expect(getClarificationQuestion("fix it")).toContain("outcome");
		expect(getClarificationQuestion("fix it")).toContain("files");
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
