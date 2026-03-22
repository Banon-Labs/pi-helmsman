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

	test("adds extra weight for cross-repo action intent in input", () => {
		const candidate = makeRepoCandidate("pi-mono");
		const result = scoreCandidateWithSignals(candidate, {
			currentRepoRoot: "/home/choza/projects/pi-helmsman",
			inputText: "inspect pi-mono and implement the change there",
			lastGoalText: "",
		});

		expect(result.reasons).toContain("repo name mentioned in input");
		expect(result.reasons).toContain("cross-repo action intent in input");
		expect(result.score).toBe(60);
	});

	test("rewards exact repo-relative directory evidence most strongly", () => {
		const candidate = makeRepoCandidate("pi-mono");
		mkdirSync(join(candidate.repoRoot, "packages/coding-agent/docs"), { recursive: true });

		const result = scoreCandidateWithSignals(candidate, {
			currentRepoRoot: "/home/choza/projects/pi-helmsman",
			inputText: "update packages/coding-agent/docs and make the change there",
			lastGoalText: "",
		});

		expect(result.reasons).toContain("repo-relative directory path exists in candidate");
		expect(result.score).toBeGreaterThan(0);
	});

	test("rewards repo-relative file evidence less strongly than an exact directory match", () => {
		const candidate = makeRepoCandidate("pi-mono");
		mkdirSync(join(candidate.repoRoot, "packages/coding-agent/docs"), { recursive: true });
		Bun.write(join(candidate.repoRoot, "packages/coding-agent/docs/extensions.md"), "# docs\n");

		const fileResult = scoreCandidateWithSignals(candidate, {
			currentRepoRoot: "/home/choza/projects/pi-helmsman",
			inputText: "update packages/coding-agent/docs/extensions.md and make the change there",
			lastGoalText: "",
		});
		const directoryResult = scoreCandidateWithSignals(candidate, {
			currentRepoRoot: "/home/choza/projects/pi-helmsman",
			inputText: "update packages/coding-agent/docs and make the change there",
			lastGoalText: "",
		});

		expect(fileResult.reasons).toContain("repo-relative file path exists in candidate");
		expect(fileResult.score).toBeLessThan(directoryResult.score);
	});

	test("does not reward unverified repo-relative path evidence strongly enough to look decisive", () => {
		const candidate = makeRepoCandidate("pi-mono");

		const result = scoreCandidateWithSignals(candidate, {
			currentRepoRoot: "/home/choza/projects/pi-helmsman",
			inputText: "update packages/coding-agent/docs and make the change there",
			lastGoalText: "",
		});

		expect(result.reasons).not.toContain("repo-relative path is unverified in candidate");
		expect(result.score).toBe(0);
	});
});
