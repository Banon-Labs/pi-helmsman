import { describe, expect, test } from "bun:test";
import {
	buildVoiceProviderArgs,
	detectAvailableVoiceProviders,
	findExecutableInPath,
	resolveVoiceProvider,
} from "./providers";

describe("findExecutableInPath", () => {
	test("returns undefined for missing executables", () => {
		expect(findExecutableInPath("definitely-not-a-real-command", "/tmp/one:/tmp/two")).toBeUndefined();
	});
});

describe("detectAvailableVoiceProviders", () => {
	test("returns an empty list when no providers are present", () => {
		expect(detectAvailableVoiceProviders("/definitely/missing")).toEqual([]);
	});
});

describe("resolveVoiceProvider", () => {
	test("prefers the configured provider when it is available", () => {
		expect(resolveVoiceProvider(["say", "spd-say"], "spd-say")).toBe("spd-say");
	});

	test("uses platform-aware fallback priority", () => {
		expect(resolveVoiceProvider(["say", "spd-say"], "espeak-ng", "linux")).toBe("spd-say");
		expect(resolveVoiceProvider(["say", "spd-say"], "espeak-ng", "darwin")).toBe("say");
	});
});

describe("buildVoiceProviderArgs", () => {
	test("uses provider-specific speech args", () => {
		expect(buildVoiceProviderArgs("say", "hello")).toEqual(["hello"]);
		expect(buildVoiceProviderArgs("espeak-ng", "hello")).toEqual(["-s", "155", "hello"]);
		expect(buildVoiceProviderArgs("spd-say", "hello")).toEqual(["-r", "-20", "hello"]);
	});
});
