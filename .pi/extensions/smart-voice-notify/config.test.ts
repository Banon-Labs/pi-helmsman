import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
	buildVoiceNotifyDirenvPattern,
	DEFAULT_VOICE_CONFIG_RELATIVE_PATH,
	formatVoiceNotifyConfig,
	resolveVoiceNotifyConfig,
	resolveVoiceNotifyConfigFilePath,
	VOICE_CONFIG_FILE_ENV,
	VOICE_MAX_CHARS_ENV,
	VOICE_MODE_ENV,
	VOICE_PROVIDER_ENV,
} from "./config";

describe("resolveVoiceNotifyConfig", () => {
	test("defaults to low-friction auto config", () => {
		expect(resolveVoiceNotifyConfig({})).toEqual({
			mode: "auto",
			preferredProvider: undefined,
			maxChars: 160,
			configSource: "defaults",
			configFilePath: undefined,
			configFileLoaded: false,
			direnvPattern: `export ${VOICE_CONFIG_FILE_ENV}=/absolute/path/to/smart-voice-notify.env && dotenv_if_exists "$${VOICE_CONFIG_FILE_ENV}"`,
			managedEnvNames: [VOICE_MODE_ENV, VOICE_PROVIDER_ENV, VOICE_MAX_CHARS_ENV],
		});
	});

	test("parses supported environment overrides", () => {
		expect(
			resolveVoiceNotifyConfig({
				[VOICE_MODE_ENV]: "on",
				[VOICE_PROVIDER_ENV]: "spd-say",
				[VOICE_MAX_CHARS_ENV]: "220",
			}),
		).toEqual({
			mode: "on",
			preferredProvider: "spd-say",
			maxChars: 220,
			configSource: "environment",
			configFilePath: undefined,
			configFileLoaded: false,
			direnvPattern: `export ${VOICE_CONFIG_FILE_ENV}=/absolute/path/to/smart-voice-notify.env && dotenv_if_exists "$${VOICE_CONFIG_FILE_ENV}"`,
			managedEnvNames: [VOICE_MODE_ENV, VOICE_PROVIDER_ENV, VOICE_MAX_CHARS_ENV],
		});
	});

	test("loads host-local values from an env file path", () => {
		const dir = join(tmpdir(), `smart-voice-config-${Date.now()}`);
		mkdirSync(dir, { recursive: true });
		const configPath = join(dir, "smart-voice-notify.env");
		writeFileSync(
			configPath,
			[
				`${VOICE_MODE_ENV}=on`,
				`${VOICE_PROVIDER_ENV}=espeak-ng`,
				`${VOICE_MAX_CHARS_ENV}=200`,
			].join("\n"),
		);

		const config = resolveVoiceNotifyConfig({
			[VOICE_CONFIG_FILE_ENV]: configPath,
		});

		expect(config.mode).toBe("on");
		expect(config.preferredProvider).toBe("espeak-ng");
		expect(config.maxChars).toBe(200);
		expect(config.configSource).toBe("env-file");
		expect(config.configFilePath).toBe(configPath);
		expect(config.configFileLoaded).toBe(true);
		expect(config.direnvPattern).toBe(`dotenv_if_exists ${configPath}`);
	});

	test("falls back safely when a configured env file is missing", () => {
		const configPath = join(tmpdir(), `missing-smart-voice-${Date.now()}.env`);
		const config = resolveVoiceNotifyConfig({
			[VOICE_CONFIG_FILE_ENV]: configPath,
		});

		expect(config.mode).toBe("auto");
		expect(config.preferredProvider).toBeUndefined();
		expect(config.maxChars).toBe(160);
		expect(config.configSource).toBe("defaults");
		expect(config.configFilePath).toBe(configPath);
		expect(config.configFileLoaded).toBe(false);
		expect(config.direnvPattern).toBe(`dotenv_if_exists ${configPath}`);
	});

	test("ignores malformed env-file lines and keeps parsing supported keys", () => {
		const dir = join(tmpdir(), `smart-voice-config-${Date.now()}-malformed`);
		mkdirSync(dir, { recursive: true });
		const configPath = join(dir, "smart-voice-notify.env");
		writeFileSync(
			configPath,
			[
				"not-an-assignment",
				"=still-invalid",
				`${VOICE_MODE_ENV}=on`,
				"export SMART_VOICE_NOTIFY_PROVIDER=spd-say",
				"UNRELATED_KEY=ignored",
			].join("\n"),
		);

		const config = resolveVoiceNotifyConfig({
			[VOICE_CONFIG_FILE_ENV]: configPath,
		});

		expect(config.mode).toBe("on");
		expect(config.preferredProvider).toBe("spd-say");
		expect(config.maxChars).toBe(160);
		expect(config.configSource).toBe("env-file");
		expect(config.configFileLoaded).toBe(true);
	});

	test("keeps direct environment variables higher precedence than file values", () => {
		const dir = join(tmpdir(), `smart-voice-config-${Date.now()}-overrides`);
		mkdirSync(dir, { recursive: true });
		const configPath = join(dir, "smart-voice-notify.env");
		writeFileSync(
			configPath,
			[
				`${VOICE_MODE_ENV}=off`,
				`${VOICE_PROVIDER_ENV}=espeak-ng`,
				`${VOICE_MAX_CHARS_ENV}=200`,
			].join("\n"),
		);

		const config = resolveVoiceNotifyConfig({
			[VOICE_CONFIG_FILE_ENV]: configPath,
			[VOICE_MODE_ENV]: "on",
			[VOICE_PROVIDER_ENV]: "spd-say",
			[VOICE_MAX_CHARS_ENV]: "220",
		});

		expect(config.mode).toBe("on");
		expect(config.preferredProvider).toBe("spd-say");
		expect(config.maxChars).toBe(220);
		expect(config.configSource).toBe("env-file+environment");
		expect(config.configFileLoaded).toBe(true);
	});
});

describe("resolveVoiceNotifyConfigFilePath", () => {
	test("prefers an explicit config-file env path", () => {
		expect(
			resolveVoiceNotifyConfigFilePath({
				[VOICE_CONFIG_FILE_ENV]: "/tmp/smart-voice.env",
				XDG_CONFIG_HOME: "/xdg",
				HOME: "/home/test",
			}),
		).toBe("/tmp/smart-voice.env");
	});

	test("falls back to XDG config home before HOME", () => {
		expect(
			resolveVoiceNotifyConfigFilePath({
				XDG_CONFIG_HOME: "/xdg",
				HOME: "/home/test",
			}),
		).toBe(`/xdg/${DEFAULT_VOICE_CONFIG_RELATIVE_PATH}`);
	});

	test("uses HOME-based default when XDG config home is unavailable", () => {
		expect(
			resolveVoiceNotifyConfigFilePath({
				HOME: "/home/test",
			}),
		).toBe("/home/test/.config/pi/smart-voice-notify.env");
	});
});

describe("formatVoiceNotifyConfig", () => {
	test("renders config provenance and direnv help", () => {
		const rendered = formatVoiceNotifyConfig({
			mode: "auto",
			preferredProvider: "say",
			maxChars: 160,
			configSource: "env-file+environment",
			configFilePath: "/tmp/smart-voice.env",
			configFileLoaded: true,
			direnvPattern: buildVoiceNotifyDirenvPattern("/tmp/smart-voice.env"),
			managedEnvNames: [VOICE_MODE_ENV, VOICE_PROVIDER_ENV, VOICE_MAX_CHARS_ENV],
		});

		expect(rendered).toContain("Mode: auto");
		expect(rendered).toContain("Preferred provider: say");
		expect(rendered).toContain("Max chars: 160");
		expect(rendered).toContain("Config source: env file + environment overrides");
		expect(rendered).toContain("Config file: /tmp/smart-voice.env (loaded)");
		expect(rendered).toContain("Direnv pattern: dotenv_if_exists /tmp/smart-voice.env");
		expect(rendered).toContain(`Managed env names: ${VOICE_MODE_ENV}, ${VOICE_PROVIDER_ENV}, ${VOICE_MAX_CHARS_ENV}`);
	});

	test("renders a narrow smart-voice-only default summary when no config file is present", () => {
		const rendered = formatVoiceNotifyConfig(resolveVoiceNotifyConfig({}));
		expect(rendered).toContain("Mode: auto");
		expect(rendered).toContain("Preferred provider: auto");
		expect(rendered).toContain("Config source: default values");
		expect(rendered).toContain("Config file: not resolved");
		expect(rendered).toContain("Managed env names: SMART_VOICE_NOTIFY_MODE, SMART_VOICE_NOTIFY_PROVIDER, SMART_VOICE_NOTIFY_MAX_CHARS");
		expect(rendered).not.toContain("generic");
		expect(rendered).not.toContain("customization");
	});

	test("renders env-file plus direct-env override provenance clearly", () => {
		const rendered = formatVoiceNotifyConfig({
			mode: "on",
			preferredProvider: "spd-say",
			maxChars: 220,
			configSource: "env-file+environment",
			configFilePath: "/tmp/smart-voice.env",
			configFileLoaded: true,
			direnvPattern: buildVoiceNotifyDirenvPattern("/tmp/smart-voice.env"),
			managedEnvNames: [VOICE_MODE_ENV, VOICE_PROVIDER_ENV, VOICE_MAX_CHARS_ENV],
		});

		expect(rendered).toContain("Mode: on");
		expect(rendered).toContain("Preferred provider: spd-say");
		expect(rendered).toContain("Max chars: 220");
		expect(rendered).toContain("Config source: env file + environment overrides");
		const lines = rendered.split("\n");
		expect(lines).toContain("Config file: /tmp/smart-voice.env (loaded)");
		expect(lines).toContain("Direnv pattern: dotenv_if_exists /tmp/smart-voice.env");
	});
});
