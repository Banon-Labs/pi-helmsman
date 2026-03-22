import { describe, expect, test } from "bun:test";
import { buildContextRoutePlan } from "./route.ts";
import type { ContextAssessment } from "./types.ts";

const mismatchAssessment: ContextAssessment = {
	state: "mismatch",
	workspaceRoot: "/home/choza/projects",
	currentRepoRoot: "/home/choza/projects/pi-helmsman",
	currentRepoCandidate: {
		repoRoot: "/home/choza/projects/pi-helmsman",
		repoName: "pi-helmsman",
		hasBeads: true,
		isCurrent: true,
		score: 100,
		reasons: ["current repo", "has .beads"],
	},
	selectedRepo: {
		repoRoot: "/home/choza/projects/pi-mono",
		repoName: "pi-mono",
		hasBeads: false,
		isCurrent: false,
		score: 110,
		reasons: ["repo-relative file path exists in candidate"],
	},
	decisionExplanation: "Selected pi-mono over current repo pi-helmsman. Winner: score=110; reasons=repo-relative file path exists in candidate. Current repo: score=100; reasons=current repo, has .beads.",
	blockMutations: true,
	summary: "Context mismatch: requested repo appears to be pi-mono",
	candidates: [],
};

describe("buildContextRoutePlan", () => {
	test("builds an explicit switch plan with fork command and traceability prompt", () => {
		const plan = buildContextRoutePlan({
			assessment: mismatchAssessment,
			sessionFile: "/home/choza/.pi/agent/sessions/abc.jsonl",
			lastInputText: "inspect pi-mono and implement the change there",
		});

		expect(plan.targetRepoRoot).toBe("/home/choza/projects/pi-mono");
		expect(plan.command).toBe("cd /home/choza/projects/pi-mono && pi --fork /home/choza/.pi/agent/sessions/abc.jsonl");
		expect(plan.handoffPrompt).toContain("Originating goal: inspect pi-mono and implement the change there");
		expect(plan.handoffPrompt).toContain("Current repo: /home/choza/projects/pi-helmsman");
		expect(plan.handoffPrompt).toContain("Target repo: /home/choza/projects/pi-mono");
		expect(plan.handoffPrompt).toContain("Suggested working folder: /home/choza/projects/pi-mono");
		expect(plan.handoffPrompt).toContain("Suggested folder source: none");
		expect(plan.handoffPrompt).toContain("Decision: Selected pi-mono over current repo pi-helmsman.");
	});

	test("uses the suggested folder when route assessment includes one", () => {
		const plan = buildContextRoutePlan({
			assessment: {
				...mismatchAssessment,
				suggestedFolder: "/home/choza/projects/pi-mono/packages/coding-agent/docs",
				suggestedFolderSource: "absolute",
				suggestedFolderBasis: "file-parent",
			},
			sessionFile: "/home/choza/.pi/agent/sessions/abc.jsonl",
			lastInputText: "update docs in packages/coding-agent/docs",
		});

		expect(plan.command).toBe(
			"cd /home/choza/projects/pi-mono/packages/coding-agent/docs && pi --fork /home/choza/.pi/agent/sessions/abc.jsonl",
		);
		expect(plan.handoffPrompt).toContain(
			"Suggested working folder: /home/choza/projects/pi-mono/packages/coding-agent/docs",
		);
		expect(plan.handoffPrompt).toContain("Suggested folder source: absolute");
		expect(plan.handoffPrompt).toContain("Suggested folder basis: file-parent");
		expect(plan.handoffPrompt).toContain("Decision: Selected pi-mono over current repo pi-helmsman.");
	});

	test("returns undefined when no target repo is available", () => {
		const plan = buildContextRoutePlan({
			assessment: { ...mismatchAssessment, selectedRepo: undefined },
			sessionFile: "/tmp/session.jsonl",
			lastInputText: "continue",
		});

		expect(plan).toBeUndefined();
	});
});
