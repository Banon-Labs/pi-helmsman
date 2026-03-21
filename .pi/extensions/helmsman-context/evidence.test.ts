import { describe, expect, test } from "bun:test";
import { collectWorkspaceEvidence, scoreCandidateWithWorkspaceEvidence } from "./evidence.ts";
import type { RepoCandidate } from "./types.ts";

const helmsman: RepoCandidate = {
	repoRoot: "/home/choza/projects/pi-helmsman",
	repoName: "pi-helmsman",
	hasBeads: true,
	isCurrent: false,
	score: 0,
	reasons: [],
};

const mono: RepoCandidate = {
	repoRoot: "/home/choza/projects/pi-mono",
	repoName: "pi-mono",
	hasBeads: false,
	isCurrent: false,
	score: 0,
	reasons: [],
};

describe("collectWorkspaceEvidence", () => {
	test("extracts repo-name mentions from issue text and session paths", () => {
		const evidence = collectWorkspaceEvidence({
			issueText: "Need to compare pi-helmsman behavior with pi-mono docs.",
			sessionPath: "/home/choza/.pi/agent/sessions/--home-choza-projects-pi-mono--/session.jsonl",
		});

		expect(evidence.text).toContain("pi-helmsman");
		expect(evidence.text).toContain("pi-mono");
	});
});

describe("scoreCandidateWithWorkspaceEvidence", () => {
	test("rewards repo mentions from issue/session evidence", () => {
		const evidenceText = collectWorkspaceEvidence({
			issueText: "Continue work for pi-mono alignment.",
			sessionPath: "/tmp/--home-choza-projects-pi-mono--/session.jsonl",
		}).text;

		const scoredMono = scoreCandidateWithWorkspaceEvidence(mono, evidenceText);
		const scoredHelmsman = scoreCandidateWithWorkspaceEvidence(helmsman, evidenceText);

		expect(scoredMono.score).toBeGreaterThan(scoredHelmsman.score);
		expect(scoredMono.reasons).toContain("repo evidence mentioned in issue/session context");
	});
});
