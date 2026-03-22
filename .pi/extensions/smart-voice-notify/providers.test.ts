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

	test("falls back to the first available provider", () => {
		expect(resolveVoiceProvider(["say", "spd-say"], "espeak-ng")).toBe("say");
	});
});

describe("buildVoiceProviderArgs", () => {
	test("passes message text directly to supported providers", () => {
		expect(buildVoiceProviderArgs("say", "hello")).toEqual(["hello"]);
		expect(buildVoiceProviderArgs("espeak-ng", "hello")).toEqual(["hello"]);
		expect(buildVoiceProviderArgs("spd-say", "hello")).toEqual(["hello"]);
	});
});
