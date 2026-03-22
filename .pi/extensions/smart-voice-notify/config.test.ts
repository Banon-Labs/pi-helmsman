import { describe, expect, test } from "bun:test";
import {
	formatVoiceNotifyConfig,
	resolveVoiceNotifyConfig,
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
		});
	});

	test("parses supported overrides", () => {
		expect(resolveVoiceNotifyConfig({
			[VOICE_MODE_ENV]: "on",
			[VOICE_PROVIDER_ENV]: "spd-say",
			[VOICE_MAX_CHARS_ENV]: "220",
		})).toEqual({
			mode: "on",
			preferredProvider: "spd-say",
			maxChars: 220,
		});
	});
});

describe("formatVoiceNotifyConfig", () => {
	test("renders a stable operator summary", () => {
		const rendered = formatVoiceNotifyConfig({
			mode: "auto",
			preferredProvider: "say",
			maxChars: 160,
		});

		expect(rendered).toContain("Mode: auto");
		expect(rendered).toContain("Preferred provider: say");
		expect(rendered).toContain("Max chars: 160");
	});
});
