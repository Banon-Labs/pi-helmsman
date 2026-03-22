import { describe, expect, test } from "bun:test";
import { parseWorkflowPlanFromText } from "./parse-plan";

describe("parseWorkflowPlanFromText", () => {
	test("parses structured planner output into workflow fields", () => {
		const parsed = parseWorkflowPlanFromText(`Goal: Add planner support\nConstraints:\n- stay read-only first\nAssumptions:\n- user wants a draft\nTarget Files:\n- .pi/extensions/helmsman-workflow.ts\nCurrent Phase: 2\nCurrent Step: 3\nVerification Notes:\n- run bun test\nApproval State: draft\nPlan:\nPhase 1: Clarify and inspect\n1. Review the current extension\n2. Confirm target files\n3. Draft structure\nPhase 2: Implement and verify\n1. Update planner state\n2. Run tests\n3. Summarize remaining risks`);

		expect(parsed).not.toBeNull();
		expect(parsed?.plan.goal).toBe("Add planner support");
		expect(parsed?.plan.constraints).toEqual(["stay read-only first"]);
		expect(parsed?.plan.assumptions).toEqual(["user wants a draft"]);
		expect(parsed?.plan.targetFiles).toEqual([".pi/extensions/helmsman-workflow.ts"]);
		expect(parsed?.plan.currentPhase).toBe(2);
		expect(parsed?.plan.currentStep).toBe(3);
		expect(parsed?.plan.verificationNotes).toEqual(["run bun test"]);
		expect(parsed?.plan.approvalState).toBe("draft");
		expect(parsed?.plan.phases).toHaveLength(2);
		expect(parsed?.present.targetFiles).toBeTrue();
		expect(parsed?.present.constraints).toBeTrue();
		expect(parsed?.plan.phases[0].steps).toEqual([
			"Review the current extension",
			"Confirm target files",
			"Draft structure",
		]);
	});

	test("returns null when no recognizable planner sections exist", () => {
		expect(parseWorkflowPlanFromText("Just a casual reply without plan structure")).toBeNull();
	});

	test("tracks which planner sections were actually present", () => {
		const parsed = parseWorkflowPlanFromText(`Goal: refine parser behavior\nPlan:\nPhase 1: Clarify\n1. Inspect parser\n2. Add tests\n3. Merge safely`);

		expect(parsed).not.toBeNull();
		expect(parsed?.present.goal).toBeTrue();
		expect(parsed?.present.phases).toBeTrue();
		expect(parsed?.present.constraints).toBeFalse();
		expect(parsed?.present.targetFiles).toBeFalse();
		expect(parsed?.present.verificationNotes).toBeFalse();
	});
});
