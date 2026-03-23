import { describe, expect, test } from "bun:test";
import {
	advanceWorkflowPlanForRun,
	advanceWorkflowPlanForStep,
	buildVerificationFailureNote,
	getBuildModePromptTransform,
	getExecutableWorkflowPlan,
	getExecutionBlockReason,
	getExecutionStateBlockReason,
	getVerificationFailureReason,
	getWorkflowInputTransform,
	isVerificationCommand,
	isWorkflowContinuationIntent,
	shouldReplanAfterExecutionBlock,
	shouldReplanAfterExecutionStateBlock,
} from "./execution";
import type { WorkflowPlanState, WorkflowState } from "./types";

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

function buildWorkflowState(overrides: Partial<WorkflowState> = {}): WorkflowState {
	const plan = buildApprovedPlan();
	return {
		mode: "plan",
		plan,
		generatedPlanText: "Goal: Execute approved workflow plan\nPlan:\nPhase 1: Inspect\n1. Read files",
		adoptedPlan: plan,
		adoptedPlanText: "Goal: Execute approved workflow plan\nPlan:\nPhase 1: Inspect\n1. Read files",
		...overrides,
	};
}

describe("build-mode continuation routing", () => {
	test("recognizes conservative workflow continuation prompts", () => {
		expect(isWorkflowContinuationIntent("continue")).toBe(true);
		expect(isWorkflowContinuationIntent(" Engage ")).toBe(true);
		expect(isWorkflowContinuationIntent("continue current task")).toBe(false);
	});

	test("rewrites continuation prompts to the guarded step command", () => {
		expect(getBuildModePromptTransform("continue")).toBe("/step");
		expect(getBuildModePromptTransform("engage")).toBe("/step");
		expect(getBuildModePromptTransform("inspect the repo")).toBeUndefined();
	});

	test("reroutes context-switch continuation prompts back through /step in build mode", () => {
		const routedPrompt = [
			"[Helmsman continuation route]",
			"Continue this task in the target repo selected by Helmsman context routing.",
			"Originating goal: inspect pi-mono and implement the change there",
		].join("\n");

		expect(getWorkflowInputTransform("build", routedPrompt)).toBe("/step");
		expect(getWorkflowInputTransform("plan", routedPrompt)).toBeUndefined();
	});
});

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

describe("shouldReplanAfterExecutionBlock", () => {
	test("does not request replanning when approval is the only blocker", () => {
		expect(shouldReplanAfterExecutionBlock(buildApprovedPlan({ approvalState: "draft" }), "step")).toBe(false);
	});

	test("requests replanning when an approved plan lacks executable structure", () => {
		expect(shouldReplanAfterExecutionBlock(buildApprovedPlan({ phases: [] }), "run")).toBe(true);
		expect(shouldReplanAfterExecutionBlock(buildApprovedPlan({ currentStep: null }), "step")).toBe(true);
	});
});

describe("execution state gating", () => {
	test("falls back to the approved legacy plan when no adopted plan exists", () => {
		const state = buildWorkflowState({ adoptedPlan: undefined, adoptedPlanText: undefined });
		expect(getExecutableWorkflowPlan(state)).toEqual(state.plan);
		expect(getExecutionStateBlockReason(state, "step")).toBeUndefined();
	});

	test("blocks execution when neither adopted state nor an approved legacy plan exists", () => {
		expect(
			getExecutionStateBlockReason(
				buildWorkflowState({ adoptedPlan: undefined, adoptedPlanText: undefined, plan: buildApprovedPlan({ approvalState: "draft" }) }),
				"step",
			),
		).toBe("/step requires an adopted plan before execution can begin. Use /approve to adopt the exact current draft.");
	});

	test("delegates to the adopted plan approval check when adoption exists", () => {
		expect(
			getExecutionStateBlockReason(
				buildWorkflowState({ adoptedPlan: buildApprovedPlan({ approvalState: "draft" }) }),
				"run",
			),
		).toBe("/run requires an approved plan before execution can begin.");
	});

	test("does not request replanning when the only blocker is a missing adopted plan", () => {
		expect(
			shouldReplanAfterExecutionStateBlock(
				buildWorkflowState({ adoptedPlan: undefined, adoptedPlanText: undefined, plan: buildApprovedPlan({ approvalState: "draft" }) }),
				"step",
			),
		).toBe(false);
	});

	test("requests replanning when the adopted plan is approved but structurally invalid", () => {
		expect(
			shouldReplanAfterExecutionStateBlock(
				buildWorkflowState({ adoptedPlan: buildApprovedPlan({ currentStep: null }) }),
				"step",
			),
		).toBe(true);
	});
});

describe("verification failure detection", () => {
	test("recognizes common verification commands", () => {
		expect(isVerificationCommand("bun test ./.pi/extensions/helmsman-workflow/*.test.ts")).toBe(true);
		expect(isVerificationCommand("npm run lint")).toBe(true);
		expect(isVerificationCommand("cargo test")).toBe(true);
		expect(isVerificationCommand("pytest -q")).toBe(true);
	});

	test("ignores non-verification commands", () => {
		expect(isVerificationCommand("git status --short --branch")).toBe(false);
		expect(isVerificationCommand("node scripts/rewrite.js")).toBe(false);
	});

	test("returns a verification-failure reason for failed verification commands", () => {
		expect(getVerificationFailureReason("bun test ./.pi/extensions/helmsman-workflow/*.test.ts")).toContain(
			"Verification command failed",
		);
	});

	test("does not treat non-verification failures as automatic replanning triggers", () => {
		expect(getVerificationFailureReason("node scripts/rewrite.js")).toBeUndefined();
	});

	test("builds a concise persisted verification failure note", () => {
		expect(buildVerificationFailureNote("bun test ./.pi/extensions/helmsman-workflow/*.test.ts")).toBe(
			"Verification failed: bun test ./.pi/extensions/helmsman-workflow/*.test.ts",
		);
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
