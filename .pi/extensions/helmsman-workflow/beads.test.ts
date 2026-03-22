import { describe, expect, test } from "bun:test";
import { buildBeadsDraftOutput, parseBeadsDraftArgs } from "./beads";
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

	test("emits update and comment drafts when an explicit current issue id is provided for a small scoped plan", () => {
		const output = buildBeadsDraftOutput(
			{
				goal: "Tighten Beads draft mapping",
				currentPhase: 1,
				currentStep: 2,
				targetFiles: [".pi/extensions/helmsman-workflow/beads.ts"],
				approvalState: "approved",
				constraints: ["stay scoped"],
				assumptions: ["phase structure is already stable"],
				verificationNotes: ["run bun test"],
				explorationCommands: [],
				phases: [],
			},
			{ currentIssueId: "pi-helmsman-3yh.4" },
		);

		expect(output.actions).toHaveLength(2);
		expect(output.actions[0]).toMatchObject({
			type: "update",
			issueId: "pi-helmsman-3yh.4",
			status: "in_progress",
		});
		expect(output.actions[1]).toMatchObject({
			type: "comment",
			issueId: "pi-helmsman-3yh.4",
		});
		expect(output.previewText).toContain("Update issue pi-helmsman-3yh.4");
		expect(output.previewText).toContain("Add comment draft for pi-helmsman-3yh.4");
		expect(output.json).toContain('"type": "update"');
		expect(output.json).toContain('"type": "comment"');
		expect(output.warnings).not.toContain("Plan has no explicit phases; emitted one scoped Beads create draft from the overall goal.");
	});

	test("emits a close draft when explicit close intent is provided for the targeted issue", () => {
		const output = buildBeadsDraftOutput(
			{
				goal: "Complete Beads draft output coverage",
				currentPhase: 2,
				currentStep: 3,
				targetFiles: [".pi/extensions/helmsman-workflow/beads.ts"],
				approvalState: "approved",
				constraints: ["keep scope tight"],
				assumptions: [],
				verificationNotes: ["bun test passed", "tmux smoke passed"],
				explorationCommands: [],
				phases: [],
			},
			{ currentIssueId: "pi-helmsman-3yh.4", closeIssue: true },
		);

		expect(output.actions).toHaveLength(3);
		expect(output.actions[2]).toMatchObject({
			type: "close",
			issueId: "pi-helmsman-3yh.4",
			reason: "Completed",
		});
		expect(output.previewText).toContain("Close issue draft pi-helmsman-3yh.4: Completed");
		expect(output.json).toContain('"type": "close"');
	});
});

describe("parseBeadsDraftArgs", () => {
	test("extracts an explicit issue id when provided", () => {
		expect(parseBeadsDraftArgs("pi-helmsman-3yh.4")).toEqual({ currentIssueId: "pi-helmsman-3yh.4" });
	});

	test("extracts explicit close intent when provided", () => {
		expect(parseBeadsDraftArgs("pi-helmsman-3yh.4 --close")).toEqual({
			currentIssueId: "pi-helmsman-3yh.4",
			closeIssue: true,
		});
	});

	test("returns empty options when no args are provided", () => {
		expect(parseBeadsDraftArgs("")).toEqual({});
	});
});
