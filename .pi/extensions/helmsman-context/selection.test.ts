import { describe, expect, test } from "bun:test";
import {
	chooseSelectableCandidates,
	formatSelectableCandidateDetails,
	formatSelectableCandidateLabel,
	shouldPromptForRepoSelection,
} from "./selection.ts";
import type { RepoCandidate } from "./types.ts";

const helmsman: RepoCandidate = {
	repoRoot: "/home/choza/projects/pi-helmsman",
	repoName: "pi-helmsman",
	hasBeads: true,
	isCurrent: true,
	score: 60,
	reasons: ["current repo", "has .beads"],
};

const mono: RepoCandidate = {
	repoRoot: "/home/choza/projects/pi-mono",
	repoName: "pi-mono",
	hasBeads: false,
	isCurrent: false,
	score: 60,
	reasons: ["repo name mentioned in input"],
};

const deadlock: RepoCandidate = {
	repoRoot: "/home/choza/projects/deadlock-VA",
	repoName: "deadlock-VA",
	hasBeads: true,
	isCurrent: false,
	score: 20,
	reasons: ["has .beads"],
};

describe("chooseSelectableCandidates", () => {
	test("returns the top scoring tied candidates for selection", () => {
		const result = chooseSelectableCandidates([helmsman, mono, deadlock]);
		expect(result.map((candidate) => candidate.repoName)).toEqual(["pi-helmsman", "pi-mono"]);
	});

	test("returns a single candidate when there is a clear leader", () => {
		const result = chooseSelectableCandidates([{ ...mono, score: 80 }, helmsman, deadlock]);
		expect(result.map((candidate) => candidate.repoName)).toEqual(["pi-mono"]);
	});
});

describe("formatSelectableCandidateLabel", () => {
	test("includes repo name, score, and top reasons in a compact label", () => {
		const label = formatSelectableCandidateLabel(helmsman);
		expect(label).toContain("pi-helmsman");
		expect(label).toContain("score=60");
		expect(label).toContain("current repo, has .beads");
		expect(label).not.toContain("/home/choza/projects/pi-helmsman");
	});
});

describe("formatSelectableCandidateDetails", () => {
	test("includes full path and all candidate reasons for tied choices", () => {
		const details = formatSelectableCandidateDetails([helmsman, mono]);
		expect(details).toContain("Ambiguous repo candidates:");
		expect(details).toContain("1. pi-helmsman");
		expect(details).toContain("Path: /home/choza/projects/pi-helmsman");
		expect(details).toContain("Reasons: current repo, has .beads");
		expect(details).toContain("2. pi-mono");
	});
});

describe("shouldPromptForRepoSelection", () => {
	test("prompts when no explicit target was given and multiple candidates tie", () => {
		expect(shouldPromptForRepoSelection({
			hasExplicitTarget: false,
			selectableCandidates: [helmsman, mono],
		})).toBe(true);
	});

	test("does not prompt when an explicit target was given", () => {
		expect(shouldPromptForRepoSelection({
			hasExplicitTarget: true,
			selectableCandidates: [helmsman, mono],
		})).toBe(false);
	});
});
