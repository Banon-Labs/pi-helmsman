import { describe, expect, test } from "bun:test";
import {
	buildScenarioArgs,
	createSandboxRoot,
	createSandboxSessionName,
	parseScenarioChoice,
	parseSandboxRunOutput,
} from "./scenario.js";

describe("helmsman tmux sandbox helpers", () => {
	test("parses known scenario choices", () => {
		expect(parseScenarioChoice("cli-smoke")).toBe("cli-smoke");
		expect(parseScenarioChoice("selection")).toBe("selection");
		expect(parseScenarioChoice("web-grounding")).toBe("web-grounding");
		expect(parseScenarioChoice("unknown")).toBeUndefined();
	});

	test("creates sandbox identifiers with the scenario prefix", () => {
		const session = createSandboxSessionName("cli-smoke");
		const root = createSandboxRoot("selection");
		expect(session.startsWith("helmsman-cli-smoke-")).toBe(true);
		expect(root.startsWith("/tmp/helmsman-selection-")).toBe(true);
	});

	test("builds cli-smoke script args with defaults", () => {
		const args = buildScenarioArgs({ scenario: "cli-smoke" });
		expect(args[0]).toBe("./testing/pi-cli-smoke.sh");
		expect(args).toContain("--prompt");
		expect(args.join(" ")).toContain("continue current task");
	});

	test("builds selection and web-grounding args", () => {
		const selectionArgs = buildScenarioArgs({ scenario: "selection" });
		expect(selectionArgs[0]).toBe("./testing/pi-selection-sandbox.sh");

		const webArgs = buildScenarioArgs({ scenario: "web-grounding", query: "hello world", limit: 7, noDemo: true });
		expect(webArgs[0]).toBe("./testing/pi-web-grounding-sandbox.sh");
		expect(webArgs).toContain("--query");
		expect(webArgs).toContain("hello world");
		expect(webArgs).toContain("--limit");
		expect(webArgs).toContain("7");
		expect(webArgs).toContain("--no-demo");
	});

	test("parses stdout key-value evidence", () => {
		const parsed = parseSandboxRunOutput([
			"session=tmux-123",
			"sandbox_root=/tmp/foo",
			"capture_out=/tmp/foo/capture.txt",
			"agent_dir=/tmp/foo/agent",
			"mirrored_host_state=1",
			"workdir=/tmp/foo/workdir",
		].join("\n"));
		expect(parsed.session).toBe("tmux-123");
		expect(parsed.sandboxRoot).toBe("/tmp/foo");
		expect(parsed.captureOut).toBe("/tmp/foo/capture.txt");
		expect(parsed.agentDir).toBe("/tmp/foo/agent");
		expect(parsed.mirroredHostState).toBe(true);
		expect(parsed.workdir).toBe("/tmp/foo/workdir");
	});
});
