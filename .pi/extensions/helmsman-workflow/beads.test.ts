import { describe, expect, test } from "bun:test";
import { buildBeadsDraftOutput } from "./beads";
import { buildPlanScaffoldFromGoal } from "./planner";

describe("buildBeadsDraftOutput", () => {
	test("builds phase-oriented create drafts with preview text and readable JSON payload", () => {
		const plan = buildPlanScaffoldFromGoal(
			"Inspect .pi/extensions/helmsman-workflow.ts and testing/pi-cli-smoke.sh",
		);
		const output = buildBeadsDraftOutput(plan);

		expect(output.adapter).toBe("beads");
		expect(output.actions.length).toBe(2);
		expect(output.actions[0]?.type).toBe("create");
		expect(output.actions[0]).toMatchObject({
			draftId: "phase-1",
			issueType: "task",
			priority: 2,
		});
		expect(output.actions[1]).toMatchObject({
			draftId: "phase-2",
			dependsOnDraftIds: ["phase-1"],
		});
		expect(output.previewText).toContain("Helmsman Beads draft preview");
		expect(output.previewText).toContain("Create issue draft phase-1");
		expect(output.previewText).toContain("Create issue draft phase-2");
		expect(output.json).toContain('"type": "create"');
		expect(output.warnings).toContain("Plan approval is still draft; review before applying any Beads actions.");
	});

	test("falls back to a single scoped create draft when no phases exist", () => {
		const output = buildBeadsDraftOutput({
			goal: "Stabilize workflow planning",
			currentPhase: null,
			currentStep: null,
			targetFiles: [".pi/extensions/helmsman-workflow.ts"],
			approvalState: "approved",
			constraints: ["stay scoped"],
			assumptions: [],
			verificationNotes: ["run bun test"],
			explorationCommands: [],
			phases: [],
		});

		expect(output.actions).toHaveLength(1);
		expect(output.actions[0]).toMatchObject({
			type: "create",
			draftId: "goal-1",
			priority: 1,
		});
		expect(output.previewText).toContain("Create issue draft goal-1");
		expect(output.warnings).toContain("Plan has no explicit phases; emitted one scoped Beads create draft from the overall goal.");
	});
});
