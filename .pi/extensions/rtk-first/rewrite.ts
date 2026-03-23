import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import type { BashSpawnContext } from "@mariozechner/pi-coding-agent";

export const RTK_BINARY = "rtk";
export const RTK_REWRITE_TIMEOUT_MS = 2_000;
export const RTK_OVERRIDDEN_READ_ONLY_TOOLS = ["read", "grep", "find", "ls"] as const;
export const RTK_PREFERRED_LIMITATION = `RTK preference applies automatically to bash and to built-in ${RTK_OVERRIDDEN_READ_ONLY_TOOLS.join("/")} when their parameters map cleanly; otherwise Pi fails open to the original built-in behavior.`;

export type RtkAvailabilityStatus = "available" | "missing" | "error";
export type RtkRewriteStatus = "rewritten" | "missing" | "unchanged" | "empty" | "error";

export interface RtkCommandRunnerOptions {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	timeout?: number;
}

export interface RtkCommandResult {
	stdout: string;
	stderr: string;
	status: number | null;
	signal: NodeJS.Signals | null;
	error?: Error;
}

export type RtkCommandRunner = (
	command: string,
	args: string[],
	options: RtkCommandRunnerOptions,
) => RtkCommandResult;

export interface RtkAvailability {
	available: boolean;
	status: RtkAvailabilityStatus;
	detail?: string;
}

export interface RtkRewriteResult {
	status: RtkRewriteStatus;
	originalCommand: string;
	command: string;
	detail?: string;
}

export interface RtkRewriteOptions extends RtkCommandRunnerOptions {
	runCommand?: RtkCommandRunner;
}

export interface RtkStatusSnapshot {
	extensionLoaded: true;
	bashToolOverride: true;
	availability: RtkAvailability;
	rewriteActive: boolean;
	fallbackMode: "disabled" | "pass_through";
	limitation: string;
	overriddenReadOnlyTools: readonly string[];
	nextSteps: string[];
}

function defaultRunCommand(command: string, args: string[], options: RtkCommandRunnerOptions): RtkCommandResult {
	const result: SpawnSyncReturns<string> = spawnSync(command, args, {
		cwd: options.cwd,
		env: options.env,
		encoding: "utf8",
		timeout: options.timeout ?? RTK_REWRITE_TIMEOUT_MS,
		windowsHide: true,
	});

	return {
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		status: result.status,
		signal: result.signal,
		error: result.error,
	};
}

function cleanDetail(detail?: string): string | undefined {
	const normalized = detail?.trim();
	return normalized ? normalized : undefined;
}

function formatExecError(error: Error): string {
	const code = (error as NodeJS.ErrnoException).code;
	return code ? `${error.message} (${code})` : error.message;
}

function createRunnerResult(command: string, args: string[], options: RtkCommandRunnerOptions, runCommand: RtkCommandRunner): RtkCommandResult {
	try {
		return runCommand(command, args, options);
	} catch (error) {
		return {
			stdout: "",
			stderr: "",
			status: null,
			signal: null,
			error: error instanceof Error ? error : new Error(String(error)),
		};
	}
}

export function probeRtkAvailability(options: RtkRewriteOptions = {}): RtkAvailability {
	const runCommand = options.runCommand ?? defaultRunCommand;
	const result = createRunnerResult(RTK_BINARY, ["--version"], options, runCommand);

	if (result.error) {
		const code = (result.error as NodeJS.ErrnoException).code;
		if (code === "ENOENT") {
			return { available: false, status: "missing", detail: `${RTK_BINARY} is not on PATH.` };
		}
		return { available: false, status: "error", detail: formatExecError(result.error) };
	}

	if (result.status === 0) {
		return {
			available: true,
			status: "available",
			detail: cleanDetail(result.stdout) ?? cleanDetail(result.stderr),
		};
	}

	return {
		available: false,
		status: "error",
		detail:
			cleanDetail(result.stderr) ??
			cleanDetail(result.stdout) ??
			`${RTK_BINARY} --version exited with code ${result.status ?? "unknown"}.`,
	};
}

export function rewriteCommandWithRtk(command: string, options: RtkRewriteOptions = {}): RtkRewriteResult {
	const runCommand = options.runCommand ?? defaultRunCommand;
	const result = createRunnerResult(RTK_BINARY, ["rewrite", command], options, runCommand);

	if (result.error) {
		const code = (result.error as NodeJS.ErrnoException).code;
		if (code === "ENOENT") {
			return {
				status: "missing",
				originalCommand: command,
				command,
				detail: `${RTK_BINARY} is not on PATH.`,
			};
		}
		return {
			status: "error",
			originalCommand: command,
			command,
			detail: formatExecError(result.error),
		};
	}

	if (result.status !== 0) {
		return {
			status: "error",
			originalCommand: command,
			command,
			detail:
				cleanDetail(result.stderr) ??
				cleanDetail(result.stdout) ??
				`${RTK_BINARY} rewrite exited with code ${result.status ?? "unknown"}.`,
		};
	}

	const rewritten = result.stdout.trim();
	if (!rewritten) {
		return {
			status: "empty",
			originalCommand: command,
			command,
			detail: cleanDetail(result.stderr) ?? `${RTK_BINARY} rewrite returned an empty command.`,
		};
	}

	if (rewritten === command) {
		return {
			status: "unchanged",
			originalCommand: command,
			command,
			detail: cleanDetail(result.stderr),
		};
	}

	return {
		status: "rewritten",
		originalCommand: command,
		command: rewritten,
		detail: cleanDetail(result.stderr),
	};
}

export function rewriteBashSpawnContextWithRtk(
	context: BashSpawnContext,
	options: Omit<RtkRewriteOptions, "cwd" | "env"> = {},
): BashSpawnContext {
	const rewrite = rewriteCommandWithRtk(context.command, {
		...options,
		cwd: context.cwd,
		env: context.env,
	});
	if (rewrite.status !== "rewritten") return context;
	return {
		...context,
		command: rewrite.command,
	};
}

export function createRtkStatusSnapshot(options: RtkRewriteOptions = {}): RtkStatusSnapshot {
	const availability = probeRtkAvailability(options);
	const nextSteps = availability.available
		? [
			"Run a bash-backed read-only inspection command such as `git status --short --branch` to confirm RTK-backed execution.",
			"Then exercise a built-in read-only tool such as `read`, `grep`, `find`, or `ls` to confirm the RTK-preferred overrides are active for supported parameter shapes.",
			"If a rewrite looks wrong, inspect `rtk rewrite '<command>'` directly and Pi will fail open to the original bash command.",
		]
		: [
			"Install RTK separately and ensure `rtk` is on PATH for the Pi process.",
			"After fixing PATH or RTK setup, run `/reload` or restart Pi, then re-run `/rtk-status`.",
		];

	if (availability.status === "error") {
		nextSteps.unshift("Fix the RTK invocation issue reported below; bash will keep passing commands through unchanged until RTK is healthy.");
	}

	return {
		extensionLoaded: true,
		bashToolOverride: true,
		availability,
		rewriteActive: availability.available,
		fallbackMode: availability.available ? "disabled" : "pass_through",
		limitation: RTK_PREFERRED_LIMITATION,
		overriddenReadOnlyTools: RTK_OVERRIDDEN_READ_ONLY_TOOLS,
		nextSteps,
	};
}

export function formatRtkStatusReport(snapshot: RtkStatusSnapshot): string {
	const lines = [
		"RTK integration status",
		`- Extension loaded: yes`,
		`- Bash override registered: yes`,
		`- RTK binary: ${snapshot.availability.available ? "available" : snapshot.availability.status}`,
		`- Bash rewriting: ${snapshot.rewriteActive ? "active via rtk rewrite" : "fail-open pass-through"}`,
		`- Built-in read-only overrides: ${snapshot.overriddenReadOnlyTools.join(", ")}`,
		`- Limitation: ${snapshot.limitation}`,
	];

	if (snapshot.availability.detail) {
		lines.push(`- Detail: ${snapshot.availability.detail}`);
	}

	lines.push("- Next steps:");
	for (const step of snapshot.nextSteps) {
		lines.push(`  - ${step}`);
	}

	return lines.join("\n");
}

export function rewriteModeSeverity(snapshot: RtkStatusSnapshot): "info" | "warning" | "error" {
	if (snapshot.availability.status === "error") return "error";
	if (snapshot.availability.status === "missing") return "warning";
	return "info";
}

export function createRtkSpawnHook(options: Omit<RtkRewriteOptions, "cwd" | "env"> = {}) {
	return (context: BashSpawnContext): BashSpawnContext => {
		try {
			return rewriteBashSpawnContextWithRtk(context, options);
		} catch {
			return context;
		}
	};
}
