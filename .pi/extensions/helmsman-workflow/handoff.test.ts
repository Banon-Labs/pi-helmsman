import { describe, expect, test } from "bun:test";
import {
	buildWorkflowHandoffPrompt,
	buildWorkflowHandoffSessionName,
	describeWorkflowPosition,
	resolveWorkflowHandoffGoal,
} from "./handoff";
import type { WorkflowState } from "./types";

function buildState(overrides: Partial<WorkflowState> = {}): WorkflowState {
	return {
		mode: "build",
		plan: {
			goal: "Land the Helmsman native handoff flow",
			currentPhase: 2,
			currentStep: 1,
			targetFiles: [".pi/extensions/helmsman-workflow.ts", ".pi/extensions/helmsman-workflow/handoff.ts"],
			approvalState: "approved",
			constraints: ["Keep the UX Pi-native"],
			assumptions: ["Pi session primitives are sufficient for v1"],
			verificationNotes: ["Run bun test", "Run tmux smoke proof"],
			explorationCommands: [],
			phases: [
				{ name: "Implement", steps: ["Add handoff helper", "Wire the command", "Run tests"] },
				{ name: "Validate", steps: ["Run tmux smoke", "Summarize evidence"] },
			],
		},
		...overrides,
	};
}

describe("describeWorkflowPosition", () => {
	test("renders phase and step when both exist", () => {
		expect(describeWorkflowPosition(buildState().plan)).toBe("phase 2, step 1");
	});

	test("falls back to not started when execution pointers are missing", () => {
		expect(describeWorkflowPosition(buildState({ plan: { ...buildState().plan, currentPhase: null, currentStep: null } }).plan)).toBe(
			"not started",
		);
	});
});

describe("resolveWorkflowHandoffGoal", () => {
	test("prefers an explicit requested goal", () => {
		expect(resolveWorkflowHandoffGoal(buildState(), "Verify the final polish in a fresh session")).toBe(
			"Verify the final polish in a fresh session",
		);
	});

	test("derives a continuation goal from the workflow state when none is provided", () => {
		expect(resolveWorkflowHandoffGoal(buildState(), "")).toBe(
			'Continue "Land the Helmsman native handoff flow" from phase 2, step 1.',
		);
	});
});

describe("buildWorkflowHandoffPrompt", () => {
	test("includes persisted workflow context and native resume hints", () => {
		const output = buildWorkflowHandoffPrompt(buildState(), "Finish validation and summarize evidence");

		expect(output).toContain("## Helmsman Context");
		expect(output).toContain("- Mode: build");
		expect(output).toContain("- Goal: Land the Helmsman native handoff flow");
		expect(output).toContain("- Approval: approved");
		expect(output).toContain("- Current position: phase 2, step 1");
		expect(output).toContain("### Target Files");
		expect(output).toContain("- .pi/extensions/helmsman-workflow.ts");
		expect(output).toContain("### Planned Phases");
		expect(output).toContain("- Phase 1: Implement");
		expect(output).toContain("## Task\nFinish validation and summarize evidence");
		expect(output).toContain("Run /status to render the persisted Helmsman workflow state");
		expect(output).toContain("Use /resume to jump back to the previous session");
	});
});

describe("buildWorkflowHandoffSessionName", () => {
	test("uses the requested goal when available", () => {
		expect(buildWorkflowHandoffSessionName(buildState(), "Validate native resume flow")).toBe(
			"Helmsman: Validate native resume flow",
		);
	});

	test("falls back to the workflow goal and trims long names", () => {
		const output = buildWorkflowHandoffSessionName(
			buildState({
				plan: {
					...buildState().plan,
					goal: "This is an intentionally long Helmsman workflow goal that should be shortened for the Pi session selector display name",
				},
			}),
			"",
		);

		expect(output.startsWith("Helmsman: This is an intentionally long Helmsman workflow goal")).toBe(true);
		expect(output.endsWith("…")).toBe(true);
		expect(output.length).toBeLessThanOrEqual(72);
	});
});
