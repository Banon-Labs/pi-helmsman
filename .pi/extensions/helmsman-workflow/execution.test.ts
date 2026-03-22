import { describe, expect, test } from "bun:test";
import {
	advanceWorkflowPlanForRun,
	advanceWorkflowPlanForStep,
	getExecutionBlockReason,
} from "./execution";
import type { WorkflowPlanState } from "./types";

function buildApprovedPlan(overrides: Partial<WorkflowPlanState> = {}): WorkflowPlanState {
	return {
		goal: "Execute approved workflow plan",
		currentPhase: 1,
		currentStep: 1,
		targetFiles: [".pi/extensions/helmsman-workflow.ts"],
		approvalState: "approved",
		constraints: [],
		assumptions: [],
		verificationNotes: [],
		explorationCommands: [],
		phases: [
			{ name: "Inspect", steps: ["Read files", "Summarize approach", "Prepare edit"] },
			{ name: "Implement", steps: ["Update code", "Run tests", "Report results"] },
		],
		...overrides,
	};
}

describe("getExecutionBlockReason", () => {
	test("blocks step execution when plan is still draft", () => {
		expect(getExecutionBlockReason(buildApprovedPlan({ approvalState: "draft" }), "step")).toBe(
			"/step requires an approved plan before execution can begin.",
		);
	});

	test("blocks run execution when no phases exist", () => {
		expect(getExecutionBlockReason(buildApprovedPlan({ phases: [] }), "run")).toBe(
			"/run requires a phased plan before execution can begin.",
		);
	});

	test("allows execution when the plan is approved and phased", () => {
		expect(getExecutionBlockReason(buildApprovedPlan(), "step")).toBeUndefined();
		expect(getExecutionBlockReason(buildApprovedPlan(), "run")).toBeUndefined();
	});
});

describe("advanceWorkflowPlanForStep", () => {
	test("advances within the current phase one step at a time", () => {
		const result = advanceWorkflowPlanForStep(buildApprovedPlan());

		expect(result.plan.currentPhase).toBe(1);
		expect(result.plan.currentStep).toBe(2);
		expect(result.summary).toBe("Advanced to step 2 of phase 1.");
	});

	test("moves to the next phase after the last step of the current phase", () => {
		const result = advanceWorkflowPlanForStep(buildApprovedPlan({ currentPhase: 1, currentStep: 3 }));

		expect(result.plan.currentPhase).toBe(2);
		expect(result.plan.currentStep).toBe(1);
		expect(result.summary).toBe("Completed phase 1 and advanced to phase 2, step 1.");
	});

	test("keeps the plan pinned at the final step when execution is already complete", () => {
		const result = advanceWorkflowPlanForStep(buildApprovedPlan({ currentPhase: 2, currentStep: 3 }));

		expect(result.plan.currentPhase).toBe(2);
		expect(result.plan.currentStep).toBe(3);
		expect(result.summary).toBe("Plan execution is already at the final step.");
	});
});

describe("advanceWorkflowPlanForRun", () => {
	test("advances to the next phase when one exists", () => {
		const result = advanceWorkflowPlanForRun(buildApprovedPlan());

		expect(result.plan.currentPhase).toBe(2);
		expect(result.plan.currentStep).toBe(1);
		expect(result.summary).toBe("Completed phase 1 and advanced to phase 2.");
	});

	test("pins execution at the final step when the current phase is already the last phase", () => {
		const result = advanceWorkflowPlanForRun(buildApprovedPlan({ currentPhase: 2, currentStep: 1 }));

		expect(result.plan.currentPhase).toBe(2);
		expect(result.plan.currentStep).toBe(3);
		expect(result.summary).toBe("Completed the final phase; no further phases remain.");
	});
});
