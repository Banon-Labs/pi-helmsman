import { spawn } from "node:child_process";
import type { VoiceNotifyConfig, VoiceProvider } from "./config.js";
import { detectAvailableVoiceProviders, buildVoiceProviderArgs, resolveVoiceProvider } from "./providers.js";

export interface VoiceNotifyStatus {
	enabled: boolean;
	mode: VoiceNotifyConfig["mode"];
	availableProviders: VoiceProvider[];
	selectedProvider?: VoiceProvider;
	ready: boolean;
	reason: string;
}

export interface VoiceSpawnHandle {
	unref(): void;
}

export type VoiceSpawn = (command: string, args: string[], options: { detached: boolean; stdio: "ignore" }) => VoiceSpawnHandle;

export function sanitizeVoiceMessage(message: string, maxChars: number): string {
	return message.replace(/\s+/g, " ").trim().slice(0, maxChars);
}

export function getVoiceNotifyStatus(config: VoiceNotifyConfig, pathEnv = process.env.PATH ?? ""): VoiceNotifyStatus {
	const availableProviders = detectAvailableVoiceProviders(pathEnv);
	const selectedProvider = resolveVoiceProvider(availableProviders, config.preferredProvider);
	if (config.mode === "off") {
		return {
			enabled: false,
			mode: config.mode,
			availableProviders,
			selectedProvider,
			ready: false,
			reason: "voice notifications disabled",
		};
	}
	if (!selectedProvider) {
		return {
			enabled: config.mode === "on",
			mode: config.mode,
			availableProviders,
			selectedProvider,
			ready: false,
			reason: config.mode === "on" ? "no configured voice provider is available" : "no local voice provider detected",
		};
	}
	return {
		enabled: true,
		mode: config.mode,
		availableProviders,
		selectedProvider,
		ready: true,
		reason: `ready via ${selectedProvider}`,
	};
}

export function formatVoiceNotifyStatus(status: VoiceNotifyStatus): string {
	return [
		`Enabled: ${status.enabled ? "yes" : "no"}`,
		`Mode: ${status.mode}`,
		`Available providers: ${status.availableProviders.join(", ") || "none"}`,
		`Selected provider: ${status.selectedProvider ?? "none"}`,
		`Ready: ${status.ready ? "yes" : "no"}`,
		`Reason: ${status.reason}`,
	].join("\n");
}

export function speakVoiceMessage(
	message: string,
	config: VoiceNotifyConfig,
	options?: { pathEnv?: string; spawnImpl?: VoiceSpawn },
): VoiceNotifyStatus {
	const status = getVoiceNotifyStatus(config, options?.pathEnv);
	if (!status.ready || !status.selectedProvider) return status;
	const sanitized = sanitizeVoiceMessage(message, config.maxChars);
	if (!sanitized) {
		return { ...status, ready: false, reason: "empty voice message after sanitization" };
	}
	const child = (options?.spawnImpl ?? spawn)(status.selectedProvider, buildVoiceProviderArgs(status.selectedProvider, sanitized), {
		detached: true,
		stdio: "ignore",
	});
	child.unref();
	return status;
}
