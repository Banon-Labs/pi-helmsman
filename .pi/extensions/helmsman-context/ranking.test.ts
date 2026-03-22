import { mkdtempSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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

function makeRepoCandidate(repoName: string): RepoCandidate {
	return {
		repoRoot: mkdtempSync(join(tmpdir(), `${repoName}-`)),
		repoName,
		hasBeads: false,
		isCurrent: false,
		score: 0,
		reasons: [],
	};
}

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

	test("rewards repo-relative folder evidence when the path exists in the candidate repo", () => {
		const candidate = makeRepoCandidate("pi-mono");
		mkdirSync(join(candidate.repoRoot, "packages/coding-agent/docs"), { recursive: true });

		const result = scoreCandidateWithSignals(candidate, {
			currentRepoRoot: "/home/choza/projects/pi-helmsman",
			inputText: "update packages/coding-agent/docs and make the change there",
			lastGoalText: "",
		});

		expect(result.reasons).toContain("repo-relative path exists in candidate");
		expect(result.score).toBeGreaterThan(0);
	});

	test("does not reward repo-relative folder evidence when the path is absent in the candidate repo", () => {
		const candidate = makeRepoCandidate("deadlock-VA");
		mkdirSync(join(candidate.repoRoot, "src/components"), { recursive: true });

		const result = scoreCandidateWithSignals(candidate, {
			currentRepoRoot: "/home/choza/projects/pi-helmsman",
			inputText: "update packages/coding-agent/docs and make the change there",
			lastGoalText: "",
		});

		expect(result.reasons).not.toContain("repo-relative path exists in candidate");
	});
});
