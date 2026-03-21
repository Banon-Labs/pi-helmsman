import { describe, expect, test } from "bun:test";
import { scoreCandidateWithSignals } from "./ranking.ts";
import type { RepoCandidate } from "./types.ts";

const baseCandidate: RepoCandidate = {
	repoRoot: "/home/choza/projects/pi-helmsman",
	repoName: "pi-helmsman",
	hasBeads: true,
	isCurrent: true,
	score: 0,
	reasons: [],
};

describe("scoreCandidateWithSignals", () => {
	test("rewards exact repo-name mention in the goal", () => {
		const result = scoreCandidateWithSignals(baseCandidate, {
			currentRepoRoot: "/home/choza/projects/pi-mono",
			inputText: "continue work in pi-helmsman",
			lastGoalText: "continue work in pi-helmsman",
		});

		expect(result.score).toBeGreaterThan(50);
		expect(result.reasons).toContain("repo name mentioned in goal");
	});

	test("rewards current repo continuity", () => {
		const result = scoreCandidateWithSignals(baseCandidate, {
			currentRepoRoot: "/home/choza/projects/pi-helmsman",
			inputText: "continue",
			lastGoalText: "continue current task",
		});

		expect(result.reasons).toContain("current repo");
	});

	test("rewards direct path mention for a repo root", () => {
		const result = scoreCandidateWithSignals(baseCandidate, {
			currentRepoRoot: "/home/choza/projects/pi-mono",
			inputText: "switch to /home/choza/projects/pi-helmsman for the change",
			lastGoalText: "",
		});

		expect(result.reasons).toContain("repo path mentioned in input");
	});
});
