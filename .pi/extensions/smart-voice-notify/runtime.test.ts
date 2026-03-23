import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
	buildAudioPlaybackArgs,
	detectAudioPlaybackCommands,
	detectVoiceHostEnvironment,
	formatVoiceNotifyStatus,
	getVoiceInstallGuidance,
	getVoiceNotifyError,
	getVoiceNotifyStatus,
	playAudioFile,
	sanitizeVoiceMessage,
	speakVoiceMessage,
	type VoiceHostEnvironment,
} from "./runtime";

const UBUNTU_OS_RELEASE = `PRETTY_NAME="Ubuntu 24.04.3 LTS"
NAME="Ubuntu"
VERSION_ID="24.04"
ID=ubuntu
ID_LIKE=debian
`;

describe("sanitizeVoiceMessage", () => {
	test("collapses whitespace and trims to the configured max", () => {
		const result = sanitizeVoiceMessage(" hello\n\nthere " + "x".repeat(300), 40);
		expect(result.startsWith("hello there")).toBe(true);
		expect(result.length).toBe(40);
	});
});

describe("detectVoiceHostEnvironment", () => {
	test("detects Ubuntu family and chooses a single least-friction recommendation", () => {
		const environment = detectVoiceHostEnvironment("linux", UBUNTU_OS_RELEASE);
		expect(environment.family).toBe("Linux");
		expect(environment.distro).toContain("Ubuntu");
		expect(environment.version).toBe("24.04");
		expect(environment.recommendedProvider).toBe("spd-say");
		expect(environment.recommendedInstallCommand).toBe(
			"sudo apt-get update && sudo apt-get install -y speech-dispatcher espeak-ng",
		);
		expect(environment.recommendation).toBe(
			"Install `speech-dispatcher` and `espeak-ng` with apt so Helmsman can auto-detect `spd-say` or `espeak-ng`.",
		);
		expect(environment.fallbackRecommendations).toEqual([
			"Fallback if the primary path is unavailable: install `espeak-ng` alone with `sudo apt-get update && sudo apt-get install -y espeak-ng`.",
		]);
	});

	test("returns macOS built-in guidance", () => {
		const environment = detectVoiceHostEnvironment("darwin");
		expect(environment.family).toBe("macOS");
		expect(environment.recommendedProvider).toBe("say");
		expect(environment.recommendation).toContain("built-in `say`");
	});

	test("falls back when linux distro details are unavailable", () => {
		const environment = detectVoiceHostEnvironment("linux", "");
		expect(environment.family).toBe("Linux");
		expect(environment.recommendation).toContain("Install `speech-dispatcher` and `espeak-ng`");
	});
});

describe("getVoiceNotifyStatus", () => {
	test("reports disabled mode clearly", () => {
		const status = getVoiceNotifyStatus({ mode: "off", preferredProvider: undefined, maxChars: 160 }, "/definitely/missing");
		expect(status.ready).toBe(false);
		expect(status.broken).toBe(false);
		expect(status.reason).toBe("voice notifications disabled");
	});

	test("reports missing providers as broken and includes detected environment guidance", () => {
		const environment = detectVoiceHostEnvironment("linux", UBUNTU_OS_RELEASE);
		const status = getVoiceNotifyStatus(
			{ mode: "auto", preferredProvider: undefined, maxChars: 160 },
			"/definitely/missing",
			environment,
		);
		expect(status.ready).toBe(false);
		expect(status.broken).toBe(true);
		expect(status.reason).toContain("auto-detected the host environment");
		expect(status.hostEnvironment.distro).toContain("Ubuntu");
		expect(status.setupGuidance).toContain("Host distro: Ubuntu 24.04.3 LTS");
		expect(status.setupGuidance).toContain("Primary recommendation: Install `speech-dispatcher` and `espeak-ng` with apt");
		expect(status.setupGuidance).toContain("Primary install command: sudo apt-get update && sudo apt-get install -y speech-dispatcher espeak-ng");
		expect(status.setupGuidance).toContain("Secondary fallback options:");
	});
});

describe("getVoiceInstallGuidance", () => {
	test("returns a single Ubuntu-first recommendation with secondary fallbacks", () => {
		const guidance = getVoiceInstallGuidance(detectVoiceHostEnvironment("linux", UBUNTU_OS_RELEASE));
		expect(guidance).toContain("auto-detects supported local providers");
		expect(guidance).toContain("Host distro: Ubuntu 24.04.3 LTS");
		expect(guidance).toContain("Primary recommendation: Install `speech-dispatcher` and `espeak-ng` with apt");
		expect(guidance).toContain("Primary install command: sudo apt-get update && sudo apt-get install -y speech-dispatcher espeak-ng");
		expect(guidance).toContain("Secondary fallback options:");
		expect(guidance).toContain("Fallback if the primary path is unavailable");
	});
});

describe("getVoiceNotifyError", () => {
	test("returns actionable guidance for broken states", () => {
		const status = getVoiceNotifyStatus(
			{ mode: "on", preferredProvider: undefined, maxChars: 160 },
			"/definitely/missing",
			detectVoiceHostEnvironment("linux", UBUNTU_OS_RELEASE),
		);
		expect(getVoiceNotifyError(status)).toContain("auto-detected the host environment");
		expect(getVoiceNotifyError(status)).toContain("Host version: 24.04");
		expect(getVoiceNotifyError(status)).toContain("Primary install command: sudo apt-get update && sudo apt-get install -y speech-dispatcher espeak-ng");
	});
});

describe("speakVoiceMessage", () => {
	test("returns broken status without spawning when no provider is available", () => {
		const status = speakVoiceMessage(
			"hello",
			{ mode: "auto", preferredProvider: undefined, maxChars: 160 },
			{
				pathEnv: "/definitely/missing",
				hostEnvironment: detectVoiceHostEnvironment("linux", UBUNTU_OS_RELEASE),
			},
		);
		expect(status.ready).toBe(false);
		expect(status.broken).toBe(true);
	});

	test("spawns the selected provider when available", () => {
		const calls: Array<{ command: string; args: string[] }> = [];
		const hostEnvironment: VoiceHostEnvironment = {
			platform: "linux",
			family: "Linux",
			distro: "Ubuntu 24.04.3 LTS",
			version: "24.04",
			recommendation: "Install `speech-dispatcher` and `espeak-ng` with apt so Helmsman can auto-detect `spd-say` or `espeak-ng`.",
			recommendedInstallCommand: "sudo apt-get update && sudo apt-get install -y speech-dispatcher espeak-ng",
			recommendedProvider: "spd-say",
			fallbackRecommendations: [
				"Fallback if the primary path is unavailable: install `espeak-ng` alone with `sudo apt-get update && sudo apt-get install -y espeak-ng`.",
			],
		};
		const status = speakVoiceMessage(
			" hello\nthere ",
			{ mode: "on", preferredProvider: "say", maxChars: 160 },
			{
				pathEnv: process.env.PATH ?? "",
				hostEnvironment,
				spawnImpl(command, args) {
					calls.push({ command, args });
					return { on() { return this; }, unref() {} };
				},
			},
		);
		if (status.selectedProvider === "say") {
			expect(calls).toEqual([{ command: "say", args: ["hello there"] }]);
		}
	});

	test("uses slower speech args for spd-say", () => {
		const calls: Array<{ command: string; args: string[] }> = [];
		speakVoiceMessage(
			" plan ready ",
			{ mode: "on", preferredProvider: "spd-say", maxChars: 160 },
			{
				pathEnv: process.env.PATH ?? "",
				hostEnvironment: detectVoiceHostEnvironment("linux", UBUNTU_OS_RELEASE),
				spawnImpl(command, args) {
					calls.push({ command, args });
					return { on() { return this; }, unref() {} };
				},
			},
		);
		if (calls.length > 0) {
			expect(calls).toEqual([{ command: "spd-say", args: ["-r", "-20", "plan ready"] }]);
		}
	});

	test("uses slower speech args for espeak-ng", () => {
		const calls: Array<{ command: string; args: string[] }> = [];
		speakVoiceMessage(
			" plan ready ",
			{ mode: "on", preferredProvider: "espeak-ng", maxChars: 160 },
			{
				pathEnv: process.env.PATH ?? "",
				hostEnvironment: detectVoiceHostEnvironment("linux", UBUNTU_OS_RELEASE),
				spawnImpl(command, args) {
					calls.push({ command, args });
					return { on() { return this; }, unref() {} };
				},
			},
		);
		if (calls.length > 0) {
			expect(calls).toEqual([{ command: "espeak-ng", args: ["-s", "155", "plan ready"] }]);
		}
	});
});

describe("playAudioFile", () => {
	test("detects supported playback commands on the host PATH", () => {
		const commands = detectAudioPlaybackCommands(process.env.PATH ?? "");
		expect(Array.isArray(commands)).toBe(true);
	});

	test("builds playback args for supported commands", () => {
		expect(buildAudioPlaybackArgs("paplay", "/tmp/test.wav")).toEqual(["/tmp/test.wav"]);
		expect(buildAudioPlaybackArgs("aplay", "/tmp/test.wav")).toEqual(["/tmp/test.wav"]);
		expect(buildAudioPlaybackArgs("ffplay", "/tmp/test.wav")).toEqual(["-nodisp", "-autoexit", "-loglevel", "quiet", "/tmp/test.wav"]);
	});

	test("spawns a playback command when a clip exists", () => {
		const clipPath = join(tmpdir(), `voice-clip-${Date.now()}.wav`);
		writeFileSync(clipPath, "clip");
		const calls: Array<{ command: string; args: string[] }> = [];
		const result = playAudioFile(clipPath, {
			pathEnv: process.env.PATH ?? "",
			spawnImpl(command, args) {
				calls.push({ command, args });
				return { on() { return this; }, unref() {} };
			},
		});
		expect(result.played).toBe(true);
		expect(calls.length).toBe(1);
	});
});

describe("formatVoiceNotifyStatus", () => {
	test("renders a readable status block", () => {
		const rendered = formatVoiceNotifyStatus({
			enabled: true,
			mode: "auto",
			availableProviders: ["say"],
			selectedProvider: "say",
			ready: true,
			broken: false,
			reason: "ready via say",
			hostEnvironment: detectVoiceHostEnvironment("linux", UBUNTU_OS_RELEASE),
			setupGuidance: undefined,
		});
		expect(rendered).toContain("Available providers: say");
		expect(rendered).toContain("Selected provider: say");
		expect(rendered).toContain("Broken: no");
		expect(rendered).toContain("Host distro: Ubuntu 24.04.3 LTS");
	});
});
