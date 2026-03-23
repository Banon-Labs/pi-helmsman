import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const VOICE_STATUS_KEY = "smart-voice-notify";
export const VOICE_STATUS_COMMAND = "voice-status";
export const SPEAK_COMMAND = "speak";
export const VOICE_CUSTOM_TYPE = "smart-voice-notify";
export const VOICE_MODE_ENV = "SMART_VOICE_NOTIFY_MODE";
export const VOICE_PROVIDER_ENV = "SMART_VOICE_NOTIFY_PROVIDER";
export const VOICE_MAX_CHARS_ENV = "SMART_VOICE_NOTIFY_MAX_CHARS";
export const VOICE_CONFIG_FILE_ENV = "SMART_VOICE_NOTIFY_CONFIG_FILE";
export const DEFAULT_VOICE_CONFIG_RELATIVE_PATH = "pi/smart-voice-notify.env";

const VOICE_CONFIG_KEYS = [VOICE_MODE_ENV, VOICE_PROVIDER_ENV, VOICE_MAX_CHARS_ENV] as const;

export type VoiceNotifyMode = "auto" | "on" | "off";
export type VoiceProvider = "say" | "espeak-ng" | "spd-say";
export type VoiceNotifyConfigSource = "defaults" | "env-file" | "environment" | "env-file+environment";

export interface VoiceNotifyConfig {
	mode: VoiceNotifyMode;
	preferredProvider?: VoiceProvider;
	maxChars: number;
	configSource: VoiceNotifyConfigSource;
	configFilePath?: string;
	configFileLoaded: boolean;
	direnvPattern: string;
	managedEnvNames: string[];
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

function parseEnvFile(text: string): Record<string, string> {
	const values: Record<string, string> = {};
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const normalized = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
		const separator = normalized.indexOf("=");
		if (separator <= 0) continue;
		const key = normalized.slice(0, separator).trim();
		const rawValue = normalized.slice(separator + 1).trim();
		if (!key) continue;
		values[key] = rawValue.replace(/^['\"]|['\"]$/g, "");
	}
	return values;
}

export function resolveVoiceNotifyConfigFilePath(env = process.env): string | undefined {
	const explicitPath = env[VOICE_CONFIG_FILE_ENV]?.trim();
	if (explicitPath) return explicitPath;
	const xdgConfigHome = env.XDG_CONFIG_HOME?.trim();
	if (xdgConfigHome) return join(xdgConfigHome, DEFAULT_VOICE_CONFIG_RELATIVE_PATH);
	const home = env.HOME?.trim();
	if (home) return join(home, ".config", DEFAULT_VOICE_CONFIG_RELATIVE_PATH);
	return undefined;
}

function readVoiceNotifyConfigFile(filePath: string | undefined): { loaded: boolean; values: Record<string, string> } {
	if (!filePath || !existsSync(filePath)) return { loaded: false, values: {} };
	return {
		loaded: true,
		values: parseEnvFile(readFileSync(filePath, "utf8")),
	};
}

function getVoiceNotifyConfigSource(fileLoaded: boolean, hasEnvironmentOverrides: boolean): VoiceNotifyConfigSource {
	if (fileLoaded && hasEnvironmentOverrides) return "env-file+environment";
	if (fileLoaded) return "env-file";
	if (hasEnvironmentOverrides) return "environment";
	return "defaults";
}

function formatConfigSourceLabel(source: VoiceNotifyConfigSource): string {
	switch (source) {
		case "env-file+environment":
			return "env file + environment overrides";
		case "env-file":
			return "env file";
		case "environment":
			return "environment";
		case "defaults":
			return "default values";
	}
}

export function buildVoiceNotifyDirenvPattern(configFilePath?: string): string {
	return configFilePath
		? `dotenv_if_exists ${configFilePath}`
		: `export ${VOICE_CONFIG_FILE_ENV}=/absolute/path/to/smart-voice-notify.env && dotenv_if_exists "$${VOICE_CONFIG_FILE_ENV}"`;
}

export function resolveVoiceNotifyConfig(env = process.env): VoiceNotifyConfig {
	const configFilePath = resolveVoiceNotifyConfigFilePath(env);
	const configFile = readVoiceNotifyConfigFile(configFilePath);
	const mergedEnv = { ...configFile.values, ...env };
	const hasEnvironmentOverrides = VOICE_CONFIG_KEYS.some((key) => Boolean(env[key]?.trim()));
	return {
		mode: parseMode(mergedEnv[VOICE_MODE_ENV]),
		preferredProvider: parseProvider(mergedEnv[VOICE_PROVIDER_ENV]),
		maxChars: parseMaxChars(mergedEnv[VOICE_MAX_CHARS_ENV]),
		configSource: getVoiceNotifyConfigSource(configFile.loaded, hasEnvironmentOverrides),
		configFilePath,
		configFileLoaded: configFile.loaded,
		direnvPattern: buildVoiceNotifyDirenvPattern(configFilePath),
		managedEnvNames: [...VOICE_CONFIG_KEYS],
	};
}

export function formatVoiceNotifyConfig(config: VoiceNotifyConfig): string {
	return [
		`Mode: ${config.mode}`,
		`Preferred provider: ${config.preferredProvider ?? "auto"}`,
		`Max chars: ${config.maxChars}`,
		`Config source: ${formatConfigSourceLabel(config.configSource)}`,
		`Config file: ${config.configFilePath ? `${config.configFilePath}${config.configFileLoaded ? " (loaded)" : " (not found)"}` : "not resolved"}`,
		`Direnv pattern: ${config.direnvPattern}`,
		`Managed env names: ${config.managedEnvNames.join(", ")}`,
	].join("\n");
}
