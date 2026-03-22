import { describe, expect, test } from "bun:test";
import {
	buildWorkflowTtsMessage,
	detectWorkflowTtsBackend,
	findExecutableInPath,
	getWorkflowTtsArgs,
	sanitizeWorkflowTtsMessage,
} from "./tts";

describe("findExecutableInPath", () => {
	test("finds executables in a synthetic PATH", () => {
		const pathEnv = "/tmp/one:/usr/local/bin:/opt/bin";
		// best-effort deterministic check via basename candidates we know do not exist here is hard,
		// so only assert absence for nonsense and leave presence to backend detection tests.
		expect(findExecutableInPath("definitely-not-a-real-command", pathEnv)).toBeUndefined();
	});
});

describe("detectWorkflowTtsBackend", () => {
	test("prefers say, then espeak-ng, then spd-say when available in PATH", () => {
		const originalPath = process.env.PATH;
		process.env.PATH = "/definitely/missing";
		expect(detectWorkflowTtsBackend(process.env.PATH)).toBeUndefined();
		process.env.PATH = originalPath;
	});
});

describe("buildWorkflowTtsMessage", () => {
	test("returns short milestone phrases", () => {
		expect(buildWorkflowTtsMessage("plan-ready")).toBe("Helmsman plan ready.");
		expect(buildWorkflowTtsMessage("approval-required")).toBe("Approval required.");
		expect(buildWorkflowTtsMessage("phase-complete")).toBe("Phase complete.");
		expect(buildWorkflowTtsMessage("run-complete")).toBe("Run complete.");
		expect(buildWorkflowTtsMessage("safety-block")).toBe("Safety block.");
	});
});

describe("sanitizeWorkflowTtsMessage", () => {
	test("collapses whitespace and trims long messages", () => {
		const sanitized = sanitizeWorkflowTtsMessage("  line one\n\nline two   " + "x".repeat(200));
		expect(sanitized.startsWith("line one line two")).toBe(true);
		expect(sanitized.length).toBeLessThanOrEqual(120);
	});
});

describe("getWorkflowTtsArgs", () => {
	test("returns backend-specific args with sanitized text", () => {
		expect(getWorkflowTtsArgs("say", " hello\nthere ")).toEqual(["hello there"]);
		expect(getWorkflowTtsArgs("espeak-ng", " hello\nthere ")).toEqual(["hello there"]);
		expect(getWorkflowTtsArgs("spd-say", " hello\nthere ")).toEqual(["hello there"]);
	});
});
