import { describe, expect, test } from "bun:test";
import { parseWorkflowPlanFromText } from "./parse-plan";

describe("parseWorkflowPlanFromText", () => {
	test("parses structured planner output into workflow fields", () => {
		const parsed = parseWorkflowPlanFromText(`Goal: Add planner support\nConstraints:\n- stay read-only first\nAssumptions:\n- user wants a draft\nTarget Files:\n- .pi/extensions/helmsman-workflow.ts\nCurrent Phase: 2\nVerification Notes:\n- run bun test\nApproval State: draft\nPlan:\nPhase 1: Clarify and inspect\n1. Review the current extension\n2. Confirm target files\n3. Draft structure\nPhase 2: Implement and verify\n1. Update planner state\n2. Run tests\n3. Summarize remaining risks`);

		expect(parsed).not.toBeNull();
		expect(parsed?.goal).toBe("Add planner support");
		expect(parsed?.constraints).toEqual(["stay read-only first"]);
		expect(parsed?.assumptions).toEqual(["user wants a draft"]);
		expect(parsed?.targetFiles).toEqual([".pi/extensions/helmsman-workflow.ts"]);
		expect(parsed?.currentPhase).toBe(2);
		expect(parsed?.verificationNotes).toEqual(["run bun test"]);
		expect(parsed?.approvalState).toBe("draft");
		expect(parsed?.phases).toHaveLength(2);
		expect(parsed?.phases[0].steps).toEqual([
			"Review the current extension",
			"Confirm target files",
			"Draft structure",
		]);
	});

	test("returns null when no recognizable planner sections exist", () => {
		expect(parseWorkflowPlanFromText("Just a casual reply without plan structure")).toBeNull();
	});
});
