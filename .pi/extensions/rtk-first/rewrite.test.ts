import { describe, expect, test } from "bun:test";
import {
	createRtkStatusSnapshot,
	formatRtkStatusReport,
	probeRtkAvailability,
	rewriteBashSpawnContextWithRtk,
	rewriteCommandWithRtk,
	rewriteModeSeverity,
} from "./rewrite";

describe("probeRtkAvailability", () => {
	test("reports missing when rtk is not on PATH", () => {
		const availability = probeRtkAvailability({
			runCommand() {
				const error = new Error("spawnSync rtk ENOENT") as NodeJS.ErrnoException;
				error.code = "ENOENT";
				return { stdout: "", stderr: "", status: null, signal: null, error };
			},
		});
		expect(availability).toEqual({
			available: false,
			status: "missing",
			detail: "rtk is not on PATH.",
		});
	});

	test("reports available when version probe succeeds", () => {
		const availability = probeRtkAvailability({
			runCommand(_command, args) {
				if (args[0] === "--version") return { stdout: "rtk 1.2.3\n", stderr: "", status: 0, signal: null };
				return { stdout: "", stderr: "", status: 1, signal: null };
			},
		});
		expect(availability).toEqual({
			available: true,
			status: "available",
			detail: "rtk 1.2.3",
		});
	});
});

describe("rewriteCommandWithRtk", () => {
	test("returns rewritten command when rtk rewrite changes it", () => {
		const rewrite = rewriteCommandWithRtk("git status --short --branch", {
			runCommand(_command, args) {
				expect(args).toEqual(["rewrite", "git status --short --branch"]);
				return { stdout: "rtk git status --short --branch\n", stderr: "", status: 0, signal: null };
			},
		});
		expect(rewrite).toEqual({
			status: "rewritten",
			originalCommand: "git status --short --branch",
			command: "rtk git status --short --branch",
			detail: undefined,
		});
	});

	test("fails open when rewrite result is unchanged", () => {
		const rewrite = rewriteCommandWithRtk("echo hi", {
			runCommand() {
				return { stdout: "echo hi\n", stderr: "", status: 0, signal: null };
			},
		});
		expect(rewrite.status).toBe("unchanged");
		expect(rewrite.command).toBe("echo hi");
	});
});

describe("rewriteBashSpawnContextWithRtk", () => {
	test("rewrites bash spawn context when rtk returns a replacement command", () => {
		const context = rewriteBashSpawnContextWithRtk(
			{ command: "git status --short --branch", cwd: "/tmp", env: { PATH: "/bin" } },
			{
				runCommand(_command, args) {
					expect(args).toEqual(["rewrite", "git status --short --branch"]);
					return { stdout: "rtk git status --short --branch\n", stderr: "", status: 0, signal: null };
				},
			},
		);
		expect(context.command).toBe("rtk git status --short --branch");
		expect(context.cwd).toBe("/tmp");
	});

	test("preserves original context when rewrite is unavailable", () => {
		const original = { command: "git status --short --branch", cwd: "/tmp", env: { PATH: "/bin" } };
		const context = rewriteBashSpawnContextWithRtk(original, {
			runCommand() {
				const error = new Error("spawnSync rtk ENOENT") as NodeJS.ErrnoException;
				error.code = "ENOENT";
				return { stdout: "", stderr: "", status: null, signal: null, error };
			},
		});
		expect(context).toEqual(original);
	});
});

describe("rtk status reporting", () => {
	test("formats an active status report", () => {
		const snapshot = createRtkStatusSnapshot({
			runCommand(_command, args) {
				if (args[0] === "--version") return { stdout: "rtk 1.2.3\n", stderr: "", status: 0, signal: null };
				return { stdout: "", stderr: "", status: 1, signal: null };
			},
		});
		const report = formatRtkStatusReport(snapshot);
		expect(report).toContain("RTK integration status");
		expect(report).toContain("Bash rewriting: active via rtk rewrite");
		expect(report).toContain("Built-in read-only overrides: read, grep, find, ls");
		expect(rewriteModeSeverity(snapshot)).toBe("info");
	});

	test("formats a fail-open warning report when rtk is missing", () => {
		const snapshot = createRtkStatusSnapshot({
			runCommand() {
				const error = new Error("spawnSync rtk ENOENT") as NodeJS.ErrnoException;
				error.code = "ENOENT";
				return { stdout: "", stderr: "", status: null, signal: null, error };
			},
		});
		const report = formatRtkStatusReport(snapshot);
		expect(report).toContain("Bash rewriting: fail-open pass-through");
		expect(report).toContain("rtk is not on PATH.");
		expect(rewriteModeSeverity(snapshot)).toBe("warning");
	});
});
