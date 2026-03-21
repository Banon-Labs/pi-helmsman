import { describe, expect, test } from "bun:test";
import { assessContext, isReadOnlyBashCommand } from "./heuristics";
import type { RepoCandidate } from "./types";

const candidates: RepoCandidate[] = [
	{
		repoRoot: "/home/choza/projects/pi-helmsman",
		repoName: "pi-helmsman",
		hasBeads: true,
		isCurrent: true,
		score: 0,
		reasons: [],
	},
	{
		repoRoot: "/home/choza/projects/pi-mono",
		repoName: "pi-mono",
		hasBeads: false,
		isCurrent: false,
		score: 0,
		reasons: [],
	},
];

describe("assessContext", () => {
	test("marks context healthy when current repo is coherent and no conflicting repo is requested", () => {
		const result = assessContext({
			workspaceRoot: "/home/choza/projects",
			currentRepoRoot: "/home/choza/projects/pi-helmsman",
			inputText: "continue hardening fetch_reference here",
			candidates,
		});

		expect(result.state).toBe("healthy");
		expect(result.selectedRepo?.repoName).toBe("pi-helmsman");
	});

	test("marks context mismatch when input explicitly mentions another repo", () => {
		const result = assessContext({
			workspaceRoot: "/home/choza/projects",
			currentRepoRoot: "/home/choza/projects/pi-helmsman",
			inputText: "inspect pi-mono and implement the change there",
			candidates,
		});

		expect(result.state).toBe("mismatch");
		expect(result.selectedRepo?.repoName).toBe("pi-mono");
		expect(result.blockMutations).toBe(true);
	});

	test("marks context uncertain when no current repo can be resolved", () => {
		const result = assessContext({
			workspaceRoot: "/home/choza/projects",
			currentRepoRoot: undefined,
			inputText: "continue",
			candidates,
		});

		expect(result.state).toBe("uncertain");
		expect(result.blockMutations).toBe(true);
	});
});

describe("isReadOnlyBashCommand", () => {
	test("allows read-only discovery commands", () => {
		expect(isReadOnlyBashCommand("git status --short")).toBe(true);
		expect(isReadOnlyBashCommand("bd show pi-helmsman-3yh.6 --json")).toBe(true);
		expect(isReadOnlyBashCommand("rg -n \"context\" .")).toBe(true);
	});

	test("rejects mutating bash commands", () => {
		expect(isReadOnlyBashCommand("git commit -m 'x'" )).toBe(false);
		expect(isReadOnlyBashCommand("bd update pi-helmsman-3yh.6 --status in_progress --json")).toBe(false);
		expect(isReadOnlyBashCommand("rm -rf testing")).toBe(false);
	});
});
