export const SANDBOX_SCENARIOS = ["cli-smoke", "selection", "web-grounding"] as const;
export type SandboxScenario = (typeof SANDBOX_SCENARIOS)[number];

export interface SandboxRunRequest {
	scenario: SandboxScenario;
	prompt?: string;
	session?: string;
	sandboxRoot?: string;
	captureOut?: string;
	waitSeconds?: number;
	noMirrorHostState?: boolean;
	query?: string;
	limit?: number;
	noDemo?: boolean;
}

export interface ParsedSandboxRun {
	scenario: SandboxScenario;
	session?: string;
	sandboxRoot?: string;
	captureOut?: string;
	agentDir?: string;
	mirroredHostState?: boolean;
	workdir?: string;
}

const SCENARIO_FILES: Record<SandboxScenario, string> = {
	"cli-smoke": "./testing/pi-cli-smoke.sh",
	selection: "./testing/pi-selection-sandbox.sh",
	"web-grounding": "./testing/pi-web-grounding-sandbox.sh",
};

function sanitizeSegment(value: string): string {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 40) || "session";
}

export function createSandboxSessionName(scenario: SandboxScenario): string {
	return `helmsman-${sanitizeSegment(scenario)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createSandboxRoot(scenario: SandboxScenario): string {
	return `/tmp/helmsman-${sanitizeSegment(scenario)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function parseScenarioChoice(choice: string | undefined): SandboxScenario | undefined {
	if (!choice) return undefined;
	const normalized = choice.trim().toLowerCase();
	return SANDBOX_SCENARIOS.find((scenario) => scenario === normalized);
}

export function buildScenarioArgs(request: SandboxRunRequest): string[] {
	const args = [SCENARIO_FILES[request.scenario]];
	const session = request.session ?? createSandboxSessionName(request.scenario);
	const sandboxRoot = request.sandboxRoot ?? createSandboxRoot(request.scenario);

	args.push("--session", session);
	args.push("--sandbox-root", sandboxRoot);

	if (request.captureOut) {
		args.push("--capture-out", request.captureOut);
	}
	if (request.waitSeconds !== undefined) {
		args.push("--wait-seconds", String(request.waitSeconds));
	}
	if (request.noMirrorHostState) {
		args.push("--no-mirror-host-state");
	}

	if (request.scenario === "cli-smoke") {
		args.push("--prompt", request.prompt?.trim() || "continue current task");
	}

	if (request.scenario === "web-grounding") {
		args.push("--query", request.query?.trim() || "rfc 9110 http semantics");
		args.push("--limit", String(request.limit ?? 3));
		if (request.noDemo) {
			args.push("--no-demo");
		}
	}

	return args;
}

export function parseSandboxRunOutput(stdout: string): ParsedSandboxRun {
	const parsed: ParsedSandboxRun = { scenario: "cli-smoke" };
	for (const line of stdout.split(/\r?\n/)) {
		const [key, ...rest] = line.split("=");
		if (!key || rest.length === 0) continue;
		const value = rest.join("=").trim();
		switch (key.trim()) {
			case "session":
				parsed.session = value;
				break;
			case "sandbox_root":
				parsed.sandboxRoot = value;
				break;
			case "capture_out":
				parsed.captureOut = value;
				break;
			case "agent_dir":
				parsed.agentDir = value;
				break;
			case "mirrored_host_state":
				parsed.mirroredHostState = value === "1" || value === "true";
				break;
			case "workdir":
				parsed.workdir = value;
				break;
		}
	}
	return parsed;
}
