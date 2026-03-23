import { describe, expect, test } from "bun:test";
import {
	buildRtkInputRewriteText,
	buildRtkToolBlockReason,
	buildRtkUserBashNotice,
	getRtkEquivalent,
	looksLikeBareInspectionPrompt,
	preferRtkCommand,
} from "./policy";

describe("getRtkEquivalent", () => {
	test("rewrites simple cat file reads to rtk read", () => {
		expect(getRtkEquivalent("cat package.json")).toEqual({
			originalCommand: "cat package.json",
			rewrittenCommand: "rtk read package.json",
			kind: "read",
		});
	});

	test("rewrites supported git inspection commands", () => {
		expect(getRtkEquivalent("git status --short --branch")?.rewrittenCommand).toBe(
			"rtk git status --short --branch",
		);
		expect(getRtkEquivalent("git diff --stat")?.rewrittenCommand).toBe("rtk git diff --stat");
		expect(getRtkEquivalent("git stash list --format='%gd %s'")?.rewrittenCommand).toBe("rtk git stash list --format='%gd %s'");
	});

	test("rewrites search and listing commands", () => {
		expect(getRtkEquivalent("find . -maxdepth 2 -type f")?.rewrittenCommand).toBe("rtk find . -maxdepth 2 -type f");
		expect(getRtkEquivalent("grep helmsman . -n")?.rewrittenCommand).toBe("rtk grep helmsman . -n");
		expect(getRtkEquivalent('grep "TODO|plan|workflow" . -n')?.rewrittenCommand).toBe('rtk grep "TODO|plan|workflow" . -n');
		expect(getRtkEquivalent("ls -la .pi/extensions")?.rewrittenCommand).toBe("rtk ls -la .pi/extensions");
	});

	test("does not rewrite commands with shell metacharacters or unsupported forms", () => {
		expect(getRtkEquivalent("cat package.json | head -20")).toBeUndefined();
		expect(getRtkEquivalent("git rev-parse --show-toplevel")).toBeUndefined();
		expect(getRtkEquivalent("rg helmsman . -n")).toBeUndefined();
	});
});

describe("looksLikeBareInspectionPrompt", () => {
	test("only matches bare native inspection commands", () => {
		expect(looksLikeBareInspectionPrompt("git status --short --branch")).toBe(true);
		expect(looksLikeBareInspectionPrompt("!git status --short --branch")).toBe(false);
		expect(looksLikeBareInspectionPrompt("/status")).toBe(false);
		expect(looksLikeBareInspectionPrompt("please inspect the repo")).toBe(false);
	});
});

describe("rtk-first prompt helpers", () => {
	test("builds user-facing rewrite messages", () => {
		const rewrite = getRtkEquivalent("git status --short --branch");
		expect(rewrite).toBeDefined();
		expect(buildRtkInputRewriteText(rewrite!)).toContain("rtk git status --short --branch");
		expect(buildRtkToolBlockReason(rewrite!)).toContain("Retry with: rtk git status --short --branch");
		expect(buildRtkUserBashNotice(rewrite!)).toBe(
			"RTK rewrite: git status --short --branch -> rtk git status --short --branch",
		);
	});

	test("normalizes generic read-only command text toward RTK centrally", () => {
		expect(preferRtkCommand("cat package.json")).toBe("rtk read package.json");
		expect(preferRtkCommand("git stash list --format='%gd %s'")).toBe("rtk git stash list --format='%gd %s'");
		expect(preferRtkCommand("echo hi")).toBe("echo hi");
	});
});
