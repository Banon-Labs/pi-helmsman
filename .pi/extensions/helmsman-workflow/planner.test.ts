import { describe, expect, test } from "bun:test";
import {
	buildPlanScaffoldFromGoal,
	buildReadOnlyExplorationCommands,
	extractTargetFileHints,
	summarizeGoalAsAssumption,
} from "./planner";

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

describe("buildReadOnlyExplorationCommands", () => {
	test("suggests targeted read-only commands when file hints exist", () => {
		const commands = buildReadOnlyExplorationCommands([
			".pi/extensions/helmsman-workflow.ts",
			"testing/pi-cli-smoke.sh",
		]);

		expect(commands).toEqual([
			"rtk read ./.pi/extensions/helmsman-workflow.ts --max-lines 200",
			"rtk read ./testing/pi-cli-smoke.sh --max-lines 200",
			"rtk grep \"helmsman-workflow\" . -n",
		]);
	});

	test("falls back to generic workspace inspection when no file hints exist", () => {
		const commands = buildReadOnlyExplorationCommands([]);

		expect(commands).toEqual([
			"rtk git status --short --branch",
			"rtk find ./.pi/extensions -maxdepth 2 -type f",
			"rtk grep \"TODO|plan|workflow\" . -n",
		]);
	});
});

describe("buildPlanScaffoldFromGoal", () => {
	 test("builds a draft scaffold with target file hints, exploration commands, and concise phases", () => {
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
		expect(plan.explorationCommands).toContain("rtk read ./.pi/extensions/helmsman-workflow.ts --max-lines 200");
	});
});
