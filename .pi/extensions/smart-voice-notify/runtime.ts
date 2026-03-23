import { existsSync, readFileSync } from "node:fs";
import { delimiter } from "node:path";
import { spawn } from "node:child_process";
import type { VoiceNotifyConfig, VoiceProvider } from "./config.js";
import { buildVoiceProviderArgs, detectAvailableVoiceProviders, resolveVoiceProvider } from "./providers.js";

export interface VoiceHostEnvironment {
	platform: NodeJS.Platform;
	family: "macOS" | "Linux" | "Other";
	distro?: string;
	version?: string;
	recommendation: string;
	recommendedInstallCommand?: string;
	recommendedProvider?: VoiceProvider;
	fallbackRecommendations?: string[];
}

export interface VoiceNotifyStatus {
	enabled: boolean;
	mode: VoiceNotifyConfig["mode"];
	availableProviders: VoiceProvider[];
	selectedProvider?: VoiceProvider;
	ready: boolean;
	broken: boolean;
	reason: string;
	hostEnvironment: VoiceHostEnvironment;
	setupGuidance?: string;
}

export interface VoiceSpawnHandle {
	on(event: "error", listener: (error: Error) => void): VoiceSpawnHandle;
	unref(): void;
}

export type VoiceSpawn = (command: string, args: string[], options: { detached: boolean; stdio: "ignore" }) => VoiceSpawnHandle;
export type AudioPlaybackCommand = "paplay" | "aplay" | "ffplay";

export interface AudioPlaybackResult {
	played: boolean;
	command?: AudioPlaybackCommand;
	filePath: string;
	reason?: string;
}

function parseOsRelease(text: string): Record<string, string> {
	const entries: Record<string, string> = {};
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const separator = trimmed.indexOf("=");
		if (separator <= 0) continue;
		const key = trimmed.slice(0, separator);
		const rawValue = trimmed.slice(separator + 1).trim();
		entries[key] = rawValue.replace(/^"|"$/g, "");
	}
	return entries;
}

export function detectVoiceHostEnvironment(
	platform = process.platform,
	osReleaseText?: string,
): VoiceHostEnvironment {
	if (platform === "darwin") {
		return {
			platform,
			family: "macOS",
			recommendation: "Use the built-in `say` command.",
			recommendedProvider: "say",
			fallbackRecommendations: ["If `say` is missing, check your PATH in the terminal where Pi is running, then rerun `/voice-status`."],
		};
	}

	if (platform === "linux") {
		const parsed = parseOsRelease(
			osReleaseText ?? (() => {
				try {
					return readFileSync("/etc/os-release", "utf8");
				} catch {
					return "";
				}
			})(),
		);
		const distro = parsed.PRETTY_NAME || parsed.NAME || parsed.ID;
		const version = parsed.VERSION_ID || parsed.VERSION;
		const distroId = (parsed.ID || "").toLowerCase();
		const distroLikes = (parsed.ID_LIKE || "").toLowerCase();
		const isUbuntuFamily = [distroId, distroLikes].some((value) => value.includes("ubuntu") || value.includes("debian"));
		const isFedoraFamily = [distroId, distroLikes].some((value) => value.includes("fedora") || value.includes("rhel"));
		const isArchFamily = [distroId, distroLikes].some((value) => value.includes("arch"));

		if (isUbuntuFamily) {
			return {
				platform,
				family: "Linux",
				distro,
				version,
				recommendation: "Install `speech-dispatcher` and `espeak-ng` with apt so Helmsman can auto-detect `spd-say` or `espeak-ng`.",
				recommendedInstallCommand: "sudo apt-get update && sudo apt-get install -y speech-dispatcher espeak-ng",
				recommendedProvider: "spd-say",
				fallbackRecommendations: [
					"Fallback if the primary path is unavailable: install `espeak-ng` alone with `sudo apt-get update && sudo apt-get install -y espeak-ng`.",
				],
			};
		}

		if (isFedoraFamily) {
			return {
				platform,
				family: "Linux",
				distro,
				version,
				recommendation: "Install `speech-dispatcher` and `espeak-ng` with dnf so Helmsman can auto-detect a working Linux voice backend.",
				recommendedInstallCommand: "sudo dnf install -y speech-dispatcher espeak-ng",
				recommendedProvider: "spd-say",
				fallbackRecommendations: [
					"Fallback if the primary path is unavailable: install `espeak-ng` alone with `sudo dnf install -y espeak-ng`.",
				],
			};
		}

		if (isArchFamily) {
			return {
				platform,
				family: "Linux",
				distro,
				version,
				recommendation: "Install `speech-dispatcher` and `espeak-ng` with pacman so Helmsman can auto-detect a working Linux voice backend.",
				recommendedInstallCommand: "sudo pacman -S --noconfirm speech-dispatcher espeak-ng",
				recommendedProvider: "spd-say",
				fallbackRecommendations: [
					"Fallback if the primary path is unavailable: install `espeak-ng` alone with `sudo pacman -S --noconfirm espeak-ng`.",
				],
			};
		}

		return {
			platform,
			family: "Linux",
			distro,
			version,
			recommendation: "Install `speech-dispatcher` and `espeak-ng`, then rerun `/voice-status`.",
			recommendedProvider: "spd-say",
			fallbackRecommendations: ["Fallback if the primary path is unavailable: install `espeak-ng` and rerun `/voice-status`."],
		};
	}

	return {
		platform,
		family: "Other",
		recommendation: "Install one supported local provider, then rerun `/voice-status`.",
		fallbackRecommendations: ["Supported providers: `say`, `espeak-ng`, `spd-say`."],
	};
}

export function sanitizeVoiceMessage(message: string, maxChars: number): string {
	return message.replace(/\s+/g, " ").trim().slice(0, maxChars);
}

export function detectAudioPlaybackCommands(pathEnv = process.env.PATH ?? ""): AudioPlaybackCommand[] {
	const commands: AudioPlaybackCommand[] = ["paplay", "aplay", "ffplay"];
	return commands.filter((command) => Boolean(findExecutable(command, pathEnv)));
}

function findExecutable(command: string, pathEnv: string): string | undefined {
	for (const dir of pathEnv.split(delimiter).filter(Boolean)) {
		const candidate = `${dir}/${command}`;
		if (existsSync(candidate)) return candidate;
	}
	return undefined;
}

export function resolveAudioPlaybackCommand(pathEnv = process.env.PATH ?? ""): AudioPlaybackCommand | undefined {
	return detectAudioPlaybackCommands(pathEnv)[0];
}

export function buildAudioPlaybackArgs(command: AudioPlaybackCommand, filePath: string): string[] {
	switch (command) {
		case "paplay":
			return [filePath];
		case "aplay":
			return [filePath];
		case "ffplay":
			return ["-nodisp", "-autoexit", "-loglevel", "quiet", filePath];
	}
}

export function playAudioFile(
	filePath: string,
	options?: { pathEnv?: string; spawnImpl?: VoiceSpawn },
): AudioPlaybackResult {
	if (!existsSync(filePath)) return { played: false, filePath, reason: "audio file does not exist" };
	const command = resolveAudioPlaybackCommand(options?.pathEnv);
	if (!command) return { played: false, filePath, reason: "no supported local audio playback command is available" };
	const child = (options?.spawnImpl ?? spawn)(command, buildAudioPlaybackArgs(command, filePath), {
		detached: true,
		stdio: "ignore",
	});
	child.on("error", () => {});
	child.unref();
	return { played: true, command, filePath };
}

export function formatVoiceHostEnvironment(environment: VoiceHostEnvironment): string {
	return [
		`Host OS family: ${environment.family}`,
		...(environment.distro ? [`Host distro: ${environment.distro}`] : []),
		...(environment.version ? [`Host version: ${environment.version}`] : []),
	].join("\n");
}

export function getVoiceInstallGuidance(environment = detectVoiceHostEnvironment()): string {
	return [
		"Helmsman auto-detects supported local providers; you do not need to choose one manually.",
		formatVoiceHostEnvironment(environment),
		`Primary recommendation: ${environment.recommendation}`,
		...(environment.recommendedInstallCommand ? [`Primary install command: ${environment.recommendedInstallCommand}`] : []),
		...(environment.fallbackRecommendations?.length
			? ["Secondary fallback options:", ...environment.fallbackRecommendations.map((option) => `- ${option}`)]
			: []),
	].join("\n");
}

export function getVoiceNotifyStatus(
	config: VoiceNotifyConfig,
	pathEnv = process.env.PATH ?? "",
	hostEnvironment = detectVoiceHostEnvironment(),
): VoiceNotifyStatus {
	const availableProviders = detectAvailableVoiceProviders(pathEnv);
	const selectedProvider = resolveVoiceProvider(availableProviders, config.preferredProvider, hostEnvironment.platform);
	if (config.mode === "off") {
		return {
			enabled: false,
			mode: config.mode,
			availableProviders,
			selectedProvider,
			ready: false,
			broken: false,
			reason: "voice notifications disabled",
			hostEnvironment,
			setupGuidance: undefined,
		};
	}
	if (!selectedProvider) {
		return {
			enabled: true,
			mode: config.mode,
			availableProviders,
			selectedProvider,
			ready: false,
			broken: true,
			reason: "Helmsman auto-detected the host environment, but no supported local voice provider is installed (tried: say, espeak-ng, spd-say)",
			hostEnvironment,
			setupGuidance: getVoiceInstallGuidance(hostEnvironment),
		};
		}
	return {
		enabled: true,
		mode: config.mode,
		availableProviders,
		selectedProvider,
		ready: true,
		broken: false,
		reason: `ready via ${selectedProvider}`,
		hostEnvironment,
		setupGuidance: undefined,
	};
}

export function formatVoiceNotifyStatus(status: VoiceNotifyStatus): string {
	return [
		`Enabled: ${status.enabled ? "yes" : "no"}`,
		`Mode: ${status.mode}`,
		`Available providers: ${status.availableProviders.join(", ") || "none"}`,
		`Selected provider: ${status.selectedProvider ?? "none"}`,
		`Ready: ${status.ready ? "yes" : "no"}`,
		`Broken: ${status.broken ? "yes" : "no"}`,
		`Reason: ${status.reason}`,
		formatVoiceHostEnvironment(status.hostEnvironment),
		...(status.setupGuidance ? ["Setup guidance:", status.setupGuidance] : []),
	].join("\n");
}

export function getVoiceNotifyError(status: VoiceNotifyStatus): string | undefined {
	if (!status.broken) return undefined;
	return `${status.reason}\n${status.setupGuidance ?? "Install one supported local provider, then rerun `/voice-status`."}`;
}

export function speakVoiceMessage(
	message: string,
	config: VoiceNotifyConfig,
	options?: { pathEnv?: string; spawnImpl?: VoiceSpawn; hostEnvironment?: VoiceHostEnvironment },
): VoiceNotifyStatus {
	const status = getVoiceNotifyStatus(config, options?.pathEnv, options?.hostEnvironment);
	if (!status.ready || !status.selectedProvider) return status;
	const sanitized = sanitizeVoiceMessage(message, config.maxChars);
	if (!sanitized) {
		return { ...status, ready: false, broken: true, reason: "empty voice message after sanitization", setupGuidance: undefined };
	}
	const child = (options?.spawnImpl ?? spawn)(status.selectedProvider, buildVoiceProviderArgs(status.selectedProvider, sanitized), {
		detached: true,
		stdio: "ignore",
	});
	child.on("error", () => {});
	child.unref();
	return status;
}
