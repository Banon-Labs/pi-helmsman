import { describe, expect, test } from "bun:test";
import { buildPlanScaffoldFromGoal, extractTargetFileHints, summarizeGoalAsAssumption } from "./planner";

describe("extractTargetFileHints", () => {
	test("captures absolute and repo-relative file-like paths from goal text", () => {
		const hints = extractTargetFileHints(
			"Update /home/choza/projects/pi-mono/packages/coding-agent/docs/extensions.md and also inspect .pi/extensions/helmsman-workflow.ts",
		);

		expect(hints).toEqual([
			"/home/choza/projects/pi-mono/packages/coding-agent/docs/extensions.md",
			".pi/extensions/helmsman-workflow.ts",
		]);
	});

	test("deduplicates repeated path hints", () => {
		const hints = extractTargetFileHints("touch .pi/extensions/helmsman-workflow.ts then revisit .pi/extensions/helmsman-workflow.ts");
		expect(hints).toEqual([".pi/extensions/helmsman-workflow.ts"]);
	});
});

describe("summarizeGoalAsAssumption", () => {
	test("returns a trimmed planning assumption when goal text exists", () => {
		expect(summarizeGoalAsAssumption("  add planner flow support  ")).toBe("The user wants: add planner flow support");
	});

	test("falls back when goal is empty", () => {
		expect(summarizeGoalAsAssumption("")).toBe("The exact implementation details still need clarification.");
	});
});

describe("buildPlanScaffoldFromGoal", () => {
	test("builds a draft scaffold with target file hints and concise phases", () => {
		const plan = buildPlanScaffoldFromGoal(
			"Add planner flow in .pi/extensions/helmsman-workflow.ts and validate with testing/pi-cli-smoke.sh",
		);

		expect(plan.goal).toBe("Add planner flow in .pi/extensions/helmsman-workflow.ts and validate with testing/pi-cli-smoke.sh");
		expect(plan.approvalState).toBe("draft");
		expect(plan.currentPhase).toBe(1);
		expect(plan.phases).toHaveLength(2);
		expect(plan.phases[0].steps.length).toBeGreaterThanOrEqual(3);
		expect(plan.phases[0].steps.length).toBeLessThanOrEqual(5);
		expect(plan.targetFiles).toEqual([
			".pi/extensions/helmsman-workflow.ts",
			"testing/pi-cli-smoke.sh",
		]);
		expect(plan.assumptions[0]).toContain("The user wants:");
		expect(plan.verificationNotes[0]).toContain("Validate with focused tests first");
	});
});
