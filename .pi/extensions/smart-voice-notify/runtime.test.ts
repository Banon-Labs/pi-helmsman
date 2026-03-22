import { describe, expect, test } from "bun:test";
import { formatVoiceNotifyStatus, getVoiceNotifyStatus, sanitizeVoiceMessage, speakVoiceMessage } from "./runtime";

describe("sanitizeVoiceMessage", () => {
	test("collapses whitespace and trims to the configured max", () => {
		const result = sanitizeVoiceMessage(" hello\n\nthere " + "x".repeat(300), 40);
		expect(result.startsWith("hello there")).toBe(true);
		expect(result.length).toBe(40);
	});
});

describe("getVoiceNotifyStatus", () => {
	test("reports disabled mode clearly", () => {
		const status = getVoiceNotifyStatus({ mode: "off", preferredProvider: undefined, maxChars: 160 }, "/definitely/missing");
		expect(status.ready).toBe(false);
		expect(status.reason).toBe("voice notifications disabled");
	});

	test("reports missing providers in auto mode", () => {
		const status = getVoiceNotifyStatus({ mode: "auto", preferredProvider: undefined, maxChars: 160 }, "/definitely/missing");
		expect(status.ready).toBe(false);
		expect(status.reason).toBe("no local voice provider detected");
	});
});

describe("speakVoiceMessage", () => {
	test("returns status without spawning when no provider is available", () => {
		const status = speakVoiceMessage("hello", { mode: "auto", preferredProvider: undefined, maxChars: 160 }, { pathEnv: "/definitely/missing" });
		expect(status.ready).toBe(false);
	});

	test("spawns the selected provider when available", () => {
		const calls: Array<{ command: string; args: string[] }> = [];
		const status = speakVoiceMessage(
			" hello\nthere ",
			{ mode: "on", preferredProvider: "say", maxChars: 160 },
			{
				pathEnv: process.env.PATH ?? "",
				spawnImpl(command, args) {
					calls.push({ command, args });
					return { unref() {} };
				},
			},
		);
		if (status.selectedProvider === "say") {
			expect(calls).toEqual([{ command: "say", args: ["hello there"] }]);
		}
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
			reason: "ready via say",
		});
		expect(rendered).toContain("Available providers: say");
		expect(rendered).toContain("Selected provider: say");
	});
});
