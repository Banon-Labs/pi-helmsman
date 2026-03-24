import { describe, expect, test } from "bun:test";
import { createSandboxRunDetails, formatSandboxRunMessage } from "./runtime.js";

describe("helmsman tmux sandbox runtime", () => {
	test("formats evidence-rich sandbox run messages", () => {
		const details = createSandboxRunDetails(
			{ scenario: "selection" },
			{
				code: 0,
				output: "selection completed",
				parsed: {
					scenario: "selection",
					session: "helmsman-selection-123",
					sandboxRoot: "/tmp/helmsman-selection-123",
					captureOut: "/tmp/helmsman-selection-123/capture.txt",
				},
			},
		);

		expect(details.scenario).toBe("selection");
		expect(formatSandboxRunMessage(details)).toContain("Scenario: selection");
		expect(formatSandboxRunMessage(details)).toContain("Session: helmsman-selection-123");
		expect(formatSandboxRunMessage(details)).toContain("Capture: /tmp/helmsman-selection-123/capture.txt");
		expect(formatSandboxRunMessage(details)).toContain("Exit code: 0");
		expect(formatSandboxRunMessage(details)).toContain("selection completed");
	});
});
