import { describe, expect, test } from "bun:test";
import {
	createDefaultWorkflowState,
	formatWorkflowStatus,
	restoreWorkflowState,
	updateWorkflowMode,
	updateWorkflowPlanGoal,
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
});

describe("formatWorkflowStatus", () => {
	test("renders placeholder scaffold values", () => {
		const output = formatWorkflowStatus(createDefaultWorkflowState());

		expect(output).toContain("Mode: plan");
		expect(output).toContain("Goal: none");
		expect(output).toContain("Current phase: none");
		expect(output).toContain("Current step: none");
		expect(output).toContain("Target files: none");
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
			},
		});

		expect(output).toContain("Mode: build");
		expect(output).toContain("Goal: finish workflow skeleton");
		expect(output).toContain("Current phase: 1");
		expect(output).toContain("Current step: 3");
		expect(output).toContain("- .pi/extensions/helmsman-workflow.ts");
		expect(output).toContain("Approval: approved");
	});
});
