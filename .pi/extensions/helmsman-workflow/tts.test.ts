import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
	buildWorkflowTtsMessage,
	detectWorkflowTtsBackend,
	findExecutableInPath,
	formatWorkflowTtsRuntimeStatus,
	getWorkflowTtsArgs,
	getWorkflowTtsRuntimeStatus,
	resolveWorkflowMilestoneClipPath,
	sanitizeWorkflowTtsMessage,
	speakWorkflowMilestone,
} from "./tts";

describe("findExecutableInPath", () => {
	test("finds executables in a synthetic PATH", () => {
		const pathEnv = "/tmp/one:/usr/local/bin:/opt/bin";
		expect(findExecutableInPath("definitely-not-a-real-command", pathEnv)).toBeUndefined();
	});
});

describe("detectWorkflowTtsBackend", () => {
	test("returns undefined when no provider is available in PATH", () => {
		const originalPath = process.env.PATH;
		process.env.PATH = "/definitely/missing";
		expect(detectWorkflowTtsBackend(process.env.PATH)).toBeUndefined();
		process.env.PATH = originalPath;
	});

	test("prefers spd-say on linux when multiple providers are available", () => {
		if (process.platform !== "linux") return;
		const backend = detectWorkflowTtsBackend(process.env.PATH ?? "");
		if (backend) {
			expect(["spd-say", "espeak-ng"]).toContain(backend);
		}
	});
});

describe("buildWorkflowTtsMessage", () => {
	test("returns short milestone phrases", () => {
		expect(buildWorkflowTtsMessage("plan-ready")).toBe("Plan ready.");
		expect(buildWorkflowTtsMessage("approval-required")).toBe("Approval required.");
		expect(buildWorkflowTtsMessage("phase-complete")).toBe("Phase complete.");
		expect(buildWorkflowTtsMessage("run-complete")).toBe("Run complete.");
		expect(buildWorkflowTtsMessage("safety-block")).toBe("Safety block.");
	});
});

describe("sanitizeWorkflowTtsMessage", () => {
	test("collapses whitespace and trims long messages", () => {
		const sanitized = sanitizeWorkflowTtsMessage("  line one\n\nline two   " + "x".repeat(200), 120);
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

describe("resolveWorkflowMilestoneClipPath", () => {
	test("finds a canonical milestone wav in the configured clip dir", () => {
		const clipDir = mkdtempSync(join(tmpdir(), "helmsman-clips-"));
		const clipPath = join(clipDir, "plan-ready.wav");
		writeFileSync(clipPath, "clip");
		expect(resolveWorkflowMilestoneClipPath("plan-ready", { HELMSMAN_TTS_CLIP_DIR: clipDir })).toBe(clipPath);
	});
});

describe("workflow tts runtime status", () => {
	test("reports configured and missing milestone clips", () => {
		const clipDir = mkdtempSync(join(tmpdir(), "helmsman-clips-"));
		writeFileSync(join(clipDir, "plan-ready.wav"), "clip");
		const status = getWorkflowTtsRuntimeStatus({ env: { HELMSMAN_TTS_CLIP_DIR: clipDir }, pathEnv: process.env.PATH ?? "" });
		expect(status.clipDir).toBe(clipDir);
		expect(status.configuredClips).toContain("plan-ready");
		expect(status.missingClips).toContain("approval-required");
	});

	test("formats a readable runtime status block", () => {
		const rendered = formatWorkflowTtsRuntimeStatus({
			backend: "spd-say",
			clipDir: "/tmp/clips",
			configuredClips: ["plan-ready"],
			missingClips: ["approval-required", "phase-complete", "run-complete", "safety-block"],
		});
		expect(rendered).toContain("Voice backend: spd-say");
		expect(rendered).toContain("Clip dir: /tmp/clips");
		expect(rendered).toContain("Configured milestone clips: plan-ready");
		expect(rendered).toContain("Missing milestone clips: approval-required");
	});
});

describe("speakWorkflowMilestone", () => {
	test("prefers a configured local clip override when playback is available", () => {
		const clipDir = mkdtempSync(join(tmpdir(), "helmsman-clips-"));
		const clipPath = join(clipDir, "plan-ready.wav");
		writeFileSync(clipPath, "clip");
		const result = speakWorkflowMilestone("plan-ready", undefined, {
			env: { ...process.env, HELMSMAN_TTS_CLIP_DIR: clipDir },
			pathEnv: process.env.PATH,
			spawnImpl() {
				return { on() { return this; }, unref() {} };
			},
		});
		expect(result.mode).toBe("clip");
		expect(result.clipPath).toBe(clipPath);
		expect(result.error).toBeUndefined();
	});

	test("surfaces an actionable error when no voice provider is available", () => {
		const originalPath = process.env.PATH;
		process.env.PATH = "/definitely/missing";
		const result = speakWorkflowMilestone("safety-block", undefined, { pathEnv: "/definitely/missing" });
		process.env.PATH = originalPath;
		expect(result.mode).toBe("tts");
		expect(result.status.broken).toBe(true);
		expect(result.error).toContain("auto-detects supported local providers");
		expect(result.error).toContain("Host distro: Ubuntu 24.04.3 LTS");
		expect(result.error).toContain("Primary recommendation: Install `speech-dispatcher` and `espeak-ng` with apt");
		expect(result.error).toContain("Primary install command: sudo apt-get update && sudo apt-get install -y speech-dispatcher espeak-ng");
		expect(result.error).toContain("Secondary fallback options:");
	});
});
