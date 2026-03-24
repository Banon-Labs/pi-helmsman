import { describe, expect, test } from "bun:test";
import {
	advanceWorkflowPlanForRun,
	advanceWorkflowPlanForStep,
	buildVerificationFailureNote,
	CONTEXT_CONTINUATION_ROUTE_MARKER,
	getExecutableWorkflowPlan,
	getExecutionBlockReason,
	getExecutionStateBlockReason,
	getVerificationFailureReason,
	isContextContinuationRoute,
	isHiddenStepCommand,
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
	test("recognizes conservative workflow continuation prompts without auto-running a hidden step command", () => {
		expect(isWorkflowContinuationIntent("continue")).toBe(true);
		expect(isWorkflowContinuationIntent(" Engage ")).toBe(true);
		expect(isWorkflowContinuationIntent("continue current task")).toBe(false);
	});

	test("detects context-switch continuation prompts without exposing /step in user input transforms", () => {
		const routedPrompt = [
			CONTEXT_CONTINUATION_ROUTE_MARKER,
			"Continue this task in the target repo selected by Helmsman context routing.",
			"Originating goal: inspect pi-mono and implement the change there",
		].join("\n");

		expect(isContextContinuationRoute(routedPrompt)).toBe(true);
		expect(isContextContinuationRoute("continue")).toBe(false);
	});

	test("recognizes direct /step invocations so the UI can block them explicitly", () => {
		expect(isHiddenStepCommand("/step")).toBe(true);
		expect(isHiddenStepCommand(" /step now")).toBe(true);
		expect(isHiddenStepCommand("/run")).toBe(false);
		expect(isHiddenStepCommand("step")).toBe(false);
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
		expect(isVerificationCommand("bun test")).toBe(true);
		expect(isVerificationCommand("pnpm exec vitest run")).toBe(true);
		expect(isVerificationCommand("npm run lint")).toBe(true);
		expect(isVerificationCommand("git status --short")).toBe(false);
	});

	test("returns a verification failure reason only for verification commands", () => {
		expect(getVerificationFailureReason("bun test ./src/foo.test.ts")).toBe(
			"Verification command failed: bun test ./src/foo.test.ts.",
		);
		expect(getVerificationFailureReason("git status --short")).toBeUndefined();
	});

	test("formats a stable verification note", () => {
		expect(buildVerificationFailureNote("pnpm test src/foo.test.ts")).toBe(
			"Verification failed: pnpm test src/foo.test.ts",
		);
	});
});

describe("workflow execution advancement", () => {
	test("advances to the next step within the current phase", () => {
		const result = advanceWorkflowPlanForStep(buildApprovedPlan());
		expect(result.plan.currentPhase).toBe(1);
		expect(result.plan.currentStep).toBe(2);
		expect(result.summary).toBe("Advanced to step 2 of phase 1.");
	});

	test("rolls to the next phase after the last step in a phase", () => {
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

	test("advances run execution to the next phase", () => {
		const result = advanceWorkflowPlanForRun(buildApprovedPlan());
		expect(result.plan.currentPhase).toBe(2);
		expect(result.plan.currentStep).toBe(1);
		expect(result.summary).toBe("Completed phase 1 and advanced to phase 2.");
	});

	test("pins run execution at the final phase once complete", () => {
		const result = advanceWorkflowPlanForRun(buildApprovedPlan({ currentPhase: 2, currentStep: 3 }));
		expect(result.plan.currentPhase).toBe(2);
		expect(result.plan.currentStep).toBe(3);
		expect(result.summary).toBe("Completed the final phase; no further phases remain.");
	});
});
