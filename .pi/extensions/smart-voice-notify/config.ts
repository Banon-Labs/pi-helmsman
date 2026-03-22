export const VOICE_STATUS_KEY = "smart-voice-notify";
export const VOICE_STATUS_COMMAND = "voice-status";
export const SPEAK_COMMAND = "speak";
export const VOICE_CUSTOM_TYPE = "smart-voice-notify";
export const VOICE_MODE_ENV = "SMART_VOICE_NOTIFY_MODE";
export const VOICE_PROVIDER_ENV = "SMART_VOICE_NOTIFY_PROVIDER";
export const VOICE_MAX_CHARS_ENV = "SMART_VOICE_NOTIFY_MAX_CHARS";

export type VoiceNotifyMode = "auto" | "on" | "off";
export type VoiceProvider = "say" | "espeak-ng" | "spd-say";

export interface VoiceNotifyConfig {
	mode: VoiceNotifyMode;
	preferredProvider?: VoiceProvider;
	maxChars: number;
}

function parseMode(value: string | undefined): VoiceNotifyMode {
	const normalized = value?.trim().toLowerCase();
	if (normalized === "on") return "on";
	if (normalized === "off") return "off";
	return "auto";
}

function parseProvider(value: string | undefined): VoiceProvider | undefined {
	const normalized = value?.trim().toLowerCase();
	if (normalized === "say" || normalized === "espeak-ng" || normalized === "spd-say") {
		return normalized;
	}
	return undefined;
}

function parseMaxChars(value: string | undefined): number {
	const parsed = Number.parseInt(value ?? "", 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return 160;
	return Math.min(parsed, 500);
}

export function resolveVoiceNotifyConfig(env = process.env): VoiceNotifyConfig {
	return {
		mode: parseMode(env[VOICE_MODE_ENV]),
		preferredProvider: parseProvider(env[VOICE_PROVIDER_ENV]),
		maxChars: parseMaxChars(env[VOICE_MAX_CHARS_ENV]),
	};
}

export function formatVoiceNotifyConfig(config: VoiceNotifyConfig): string {
	return [
		`Mode: ${config.mode}`,
		`Preferred provider: ${config.preferredProvider ?? "auto"}`,
		`Max chars: ${config.maxChars}`,
	].join("\n");
}
