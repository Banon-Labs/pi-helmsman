import { mkdtempSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { formatAssessment } from "../helmsman-context";
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

function makeCandidate(repoName: string, options?: { hasBeads?: boolean; isCurrent?: boolean }) {
	return {
		repoRoot: mkdtempSync(join(tmpdir(), `${repoName}-`)),
		repoName,
		hasBeads: options?.hasBeads ?? false,
		isCurrent: options?.isCurrent ?? false,
		score: 0,
		reasons: [],
	} satisfies RepoCandidate;
}

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

	test("does not hard-switch repos on weak stale-name residue alone", () => {
		const currentCandidate = makeCandidate("pi-helmsman", { hasBeads: true, isCurrent: true });
		const beadsCandidate = makeCandidate("beads", { hasBeads: true });

		const result = assessContext({
			workspaceRoot: dirname(currentCandidate.repoRoot),
			currentRepoRoot: currentCandidate.repoRoot,
			inputText: "beads noisy/polluted",
			workspaceEvidenceText: currentCandidate.repoName,
			candidates: [currentCandidate, beadsCandidate],
		});

		expect(result.state).toBe("healthy");
		expect(result.selectedRepo?.repoRoot).toBe(currentCandidate.repoRoot);
		expect(result.blockMutations).toBe(false);
	});

	test("renders confidence labels for strong and weak candidates", () => {
		const currentCandidate = makeCandidate("pi-helmsman", { hasBeads: true, isCurrent: true });
		const beadsCandidate = makeCandidate("beads", { hasBeads: true });

		const result = assessContext({
			workspaceRoot: dirname(currentCandidate.repoRoot),
			currentRepoRoot: currentCandidate.repoRoot,
			inputText: "beads noisy/polluted",
			workspaceEvidenceText: currentCandidate.repoName,
			candidates: [currentCandidate, beadsCandidate],
		});
		const rendered = formatAssessment(result);

		expect(rendered).toContain("confidence=90% (high confidence)");
		expect(rendered).toContain("confidence=30% (low confidence)");
		expect(rendered).not.toContain("⚪");
		expect(rendered).not.toContain("🟡");
		expect(rendered).not.toContain("🟢");
	});

	test("surfaces a suggested working folder when input mentions a subpath in the selected repo", () => {
		const result = assessContext({
			workspaceRoot: "/home/choza/projects",
			currentRepoRoot: "/home/choza/projects/pi-helmsman",
			inputText: "update /home/choza/projects/pi-mono/packages/coding-agent/docs and make the change there",
			candidates,
		});

		expect(result.selectedRepo?.repoName).toBe("pi-mono");
		expect(result.suggestedFolder).toBe("/home/choza/projects/pi-mono/packages/coding-agent/docs");
		expect(result.suggestedFolderSource).toBe("absolute");
		expect(result.suggestedFolderBasis).toBe("directory");
	});

	test("marks context uncertain when no current repo can be resolved", () => {
		const result = assessContext({
			workspaceRoot: "/home/choza/projects",
			currentRepoRoot: undefined,
			inputText: "continue",
			candidates,
		});

		expect(result.state).toBe("uncertain");
		expect(result.blockMutations).toBe(false);
	});

	test("prefers a candidate with matching repo-relative path evidence over ambient current-repo bias", () => {
		const currentCandidate = makeCandidate("pi-helmsman", { hasBeads: true, isCurrent: true });
		const targetCandidate = makeCandidate("pi-mono");
		mkdirSync(join(targetCandidate.repoRoot, "packages/coding-agent/docs"), { recursive: true });

		const result = assessContext({
			workspaceRoot: dirname(targetCandidate.repoRoot),
			currentRepoRoot: currentCandidate.repoRoot,
			inputText: "update packages/coding-agent/docs and make the change there",
			workspaceEvidenceText: currentCandidate.repoName,
			candidates: [currentCandidate, targetCandidate],
		});

		expect(result.selectedRepo?.repoRoot).toBe(targetCandidate.repoRoot);
		expect(result.selectedRepo?.reasons).toContain("repo-relative directory path exists in candidate");
		expect(result.decisionExplanation).toContain("Selected pi-mono over current repo pi-helmsman.");
		expect(result.decisionExplanation).toContain("Winner: score=");
		expect(result.decisionExplanation).toContain("Current repo: score=");
		expect(result.state).toBe("mismatch");
	});

	test("prefers a candidate with matching repo-relative file evidence over ambient current-repo bias", () => {
		const currentCandidate = makeCandidate("pi-helmsman", { hasBeads: true, isCurrent: true });
		const targetCandidate = makeCandidate("pi-mono");
		const docsDir = join(targetCandidate.repoRoot, "packages/coding-agent/docs");
		mkdirSync(docsDir, { recursive: true });
		Bun.write(join(docsDir, "extensions.md"), "# docs\n");

		const result = assessContext({
			workspaceRoot: dirname(targetCandidate.repoRoot),
			currentRepoRoot: currentCandidate.repoRoot,
			inputText: "update packages/coding-agent/docs/extensions.md and make the change there",
			workspaceEvidenceText: currentCandidate.repoName,
			candidates: [currentCandidate, targetCandidate],
		});

		expect(result.selectedRepo?.repoRoot).toBe(targetCandidate.repoRoot);
		expect(result.selectedRepo?.reasons).toContain("repo-relative file path exists in candidate");
		expect(result.state).toBe("mismatch");
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
