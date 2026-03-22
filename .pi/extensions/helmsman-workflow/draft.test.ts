import { describe, expect, test } from "bun:test";
import { renderWorkflowPlanDraft } from "./draft";
import { parseWorkflowPlanFromText } from "./parse-plan";

describe("renderWorkflowPlanDraft", () => {
	test("renders structured planner draft text that round-trips through the parser", () => {
		const rendered = renderWorkflowPlanDraft({
			goal: "Inspect .pi/extensions/helmsman-workflow.ts",
			currentPhase: 2,
			currentStep: 1,
			targetFiles: [".pi/extensions/helmsman-workflow.ts"],
			approvalState: "draft",
			constraints: ["stay read-only first"],
			assumptions: ["user wants a draft plan"],
			verificationNotes: ["run bun test"],
			explorationCommands: ["rtk read ./.pi/extensions/helmsman-workflow.ts --max-lines 200"],
			phases: [
				{ name: "Clarify and inspect", steps: ["Read the extension", "Confirm target files", "Summarize scope"] },
				{ name: "Implement and verify", steps: ["Update logic", "Run tests", "Capture smoke evidence"] },
			],
		});

		expect(rendered).toContain("Goal: Inspect .pi/extensions/helmsman-workflow.ts");
		expect(rendered).toContain("Current Phase: 2");
		expect(rendered).toContain("Current Step: 1");
		expect(rendered).toContain("Plan:");
		expect(rendered).toContain("Phase 1: Clarify and inspect");

		const parsed = parseWorkflowPlanFromText(rendered);
		expect(parsed).not.toBeNull();
		expect(parsed?.plan.goal).toBe("Inspect .pi/extensions/helmsman-workflow.ts");
		expect(parsed?.plan.currentPhase).toBe(2);
		expect(parsed?.plan.currentStep).toBe(1);
		expect(parsed?.plan.targetFiles).toEqual([".pi/extensions/helmsman-workflow.ts"]);
		expect(parsed?.plan.constraints).toEqual(["stay read-only first"]);
		expect(parsed?.plan.assumptions).toEqual(["user wants a draft plan"]);
		expect(parsed?.plan.verificationNotes).toEqual(["run bun test"]);
		expect(parsed?.plan.approvalState).toBe("draft");
		expect(parsed?.plan.phases).toHaveLength(2);
	});

	test("renders placeholder sections for an empty draft", () => {
		const rendered = renderWorkflowPlanDraft({
			goal: "",
			currentPhase: null,
			currentStep: null,
			targetFiles: [],
			approvalState: "draft",
			constraints: [],
			assumptions: [],
			verificationNotes: [],
			explorationCommands: [],
			phases: [],
		});

		expect(rendered).toContain("Goal: none");
		expect(rendered).toContain("Target Files:\n- none");
		expect(rendered).toContain("Plan:\nPhase 1: Pending\n1. Define the next concrete planning step");
	});
});
