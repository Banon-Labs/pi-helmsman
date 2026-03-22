import { describe, expect, test } from "bun:test";
import {
	createDefaultWorkflowState,
	formatWorkflowStatus,
	mergeWorkflowPlanState,
	restoreWorkflowState,
	updateWorkflowMode,
	updateWorkflowPlanGoal,
	updateWorkflowPlanScaffold,
} from "./state";

describe("createDefaultWorkflowState", () => {
	test("defaults to plan mode with placeholder scaffold", () => {
		const state = createDefaultWorkflowState();

		expect(state).toEqual({
			mode: "plan",
			plan: {
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
			},
		});
	});
});

describe("restoreWorkflowState", () => {
	test("restores the latest workflow custom entry", () => {
		const state = restoreWorkflowState([
			{ type: "custom", customType: "helmsman-workflow-state", data: { mode: "plan", plan: { goal: "older" } } },
			{ type: "custom", customType: "other-extension", data: { mode: "build" } },
			{
				type: "custom",
				customType: "helmsman-workflow-state",
				data: {
					mode: "build",
					plan: {
						goal: "ship workflow skeleton",
						currentPhase: 1,
						currentStep: 2,
						targetFiles: [".pi/extensions/helmsman-workflow.ts"],
						approvalState: "approved",
						constraints: ["stay scoped"],
						assumptions: ["existing scaffold is valid"],
						verificationNotes: ["run focused tests"],
						explorationCommands: ["rtk read ./.pi/extensions/helmsman-workflow.ts --max-lines 200"],
						phases: [{ name: "Inspect", steps: ["Read files", "Summarize approach", "Prepare implementation"] }],
					},
				},
			},
		]);

		expect(state.mode).toBe("build");
		expect(state.plan.goal).toBe("ship workflow skeleton");
		expect(state.plan.currentPhase).toBe(1);
		expect(state.plan.currentStep).toBe(2);
		expect(state.plan.targetFiles).toEqual([".pi/extensions/helmsman-workflow.ts"]);
		expect(state.plan.approvalState).toBe("approved");
		expect(state.plan.constraints).toEqual(["stay scoped"]);
		expect(state.plan.explorationCommands).toEqual(["rtk read ./.pi/extensions/helmsman-workflow.ts --max-lines 200"]);
	});

	test("falls back to defaults when no custom entry exists", () => {
		const state = restoreWorkflowState([{ type: "custom", customType: "other-extension", data: {} }]);

		expect(state).toEqual(createDefaultWorkflowState());
	});
});

describe("workflow state updates", () => {
	test("updates mode without losing scaffold", () => {
		const state = updateWorkflowPlanGoal(createDefaultWorkflowState(), "plan the workflow skeleton");
		const updated = updateWorkflowMode(state, "build");

		expect(updated.mode).toBe("build");
		expect(updated.plan.goal).toBe("plan the workflow skeleton");
		expect(updated.plan.approvalState).toBe("draft");
	});

	test("records plan goal in scaffold", () => {
		const updated = updateWorkflowPlanGoal(createDefaultWorkflowState(), "add /mode and /status commands");

		expect(updated.plan.goal).toBe("add /mode and /status commands");
		expect(updated.plan.approvalState).toBe("draft");
	});

	test("builds a richer plan scaffold from a goal", () => {
		const updated = updateWorkflowPlanScaffold(
			createDefaultWorkflowState(),
			"Add planner flow in .pi/extensions/helmsman-workflow.ts and validate with testing/pi-cli-smoke.sh",
		);

		expect(updated.plan.currentPhase).toBe(1);
		expect(updated.plan.currentStep).toBe(1);
		expect(updated.plan.targetFiles).toEqual([
			".pi/extensions/helmsman-workflow.ts",
			"testing/pi-cli-smoke.sh",
		]);
		expect(updated.plan.explorationCommands).toContain("rtk read ./.pi/extensions/helmsman-workflow.ts --max-lines 200");
		expect(updated.plan.phases.length).toBeGreaterThan(0);
	});

	test("merges parsed plan output without dropping prior scaffold detail when sections are omitted", () => {
		const existingPlan = updateWorkflowPlanScaffold(
			createDefaultWorkflowState(),
			"Inspect .pi/extensions/helmsman-workflow.ts and testing/pi-cli-smoke.sh",
		).plan;
		const merged = mergeWorkflowPlanState(existingPlan, {
			goal: "Inspect .pi/extensions/helmsman-workflow.ts and testing/pi-cli-smoke.sh",
			currentPhase: 2,
			currentStep: 1,
			targetFiles: [],
			approvalState: "draft",
			constraints: [],
			assumptions: [],
			verificationNotes: ["run bun test"],
			explorationCommands: [],
			phases: [{ name: "Implement and verify", steps: ["Update runtime wiring", "Run tests", "Summarize blockers"] }],
		});

		expect(merged.goal).toBe(existingPlan.goal);
		expect(merged.currentPhase).toBe(2);
		expect(merged.currentStep).toBe(1);
		expect(merged.targetFiles).toEqual(existingPlan.targetFiles);
		expect(merged.constraints).toEqual(existingPlan.constraints);
		expect(merged.assumptions).toEqual(existingPlan.assumptions);
		expect(merged.verificationNotes).toEqual(["run bun test"]);
		expect(merged.explorationCommands).toEqual(existingPlan.explorationCommands);
		expect(merged.phases).toEqual([{ name: "Implement and verify", steps: ["Update runtime wiring", "Run tests", "Summarize blockers"] }]);
	});
});

describe("formatWorkflowStatus", () => {
	test("renders placeholder scaffold values", () => {
		const output = formatWorkflowStatus(createDefaultWorkflowState());

		expect(output).toContain("Mode: plan");
		expect(output).toContain("Goal: none");
		expect(output).toContain("Current phase: none");
		expect(output).toContain("Current step: none");
		expect(output).toContain("Target files: none");
		expect(output).toContain("Constraints: none");
		expect(output).toContain("Assumptions: none");
		expect(output).toContain("Verification notes: none");
		expect(output).toContain("Read-only exploration commands: none");
		expect(output).toContain("Phases: none");
		expect(output).toContain("Approval: draft");
	});

		test("renders populated scaffold values", () => {
		const output = formatWorkflowStatus({
			mode: "build",
			plan: {
				goal: "finish workflow skeleton",
				currentPhase: 1,
				currentStep: 3,
				targetFiles: [".pi/extensions/helmsman-workflow.ts", ".pi/extensions/helmsman-workflow/state.ts"],
				approvalState: "approved",
				constraints: ["stay scoped"],
				assumptions: ["status plumbing is already present"],
				verificationNotes: ["run bun test"],
				explorationCommands: ["rtk read ./.pi/extensions/helmsman-workflow.ts --max-lines 200"],
				phases: [{ name: "Implement", steps: ["Update code", "Run tests", "Smoke validate"] }],
			},
		});

		expect(output).toContain("Mode: build");
		expect(output).toContain("Goal: finish workflow skeleton");
		expect(output).toContain("Current phase: 1");
		expect(output).toContain("Current step: 3");
		expect(output).toContain("- .pi/extensions/helmsman-workflow.ts");
		expect(output).toContain("- stay scoped");
		expect(output).toContain("- status plumbing is already present");
		expect(output).toContain("- rtk read ./.pi/extensions/helmsman-workflow.ts --max-lines 200");
		expect(output).toContain("Phase 1: Implement");
		expect(output).toContain("Approval: approved");
	});
});
