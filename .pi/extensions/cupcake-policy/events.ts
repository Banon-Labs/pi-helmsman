export interface CupcakePolicyEvent {
	hook_event_name: "PreToolUse" | "PostToolUse";
	harness: "pi";
	kind: "tool_call" | "user_bash" | "tool_result";
	tool: string;
	cwd: string;
	args: Record<string, unknown>;
	result?: Record<string, unknown>;
}

export interface CupcakeToolCallInput {
	toolName: string;
	input: Record<string, unknown>;
	cwd: string;
}

export interface CupcakeUserBashInput {
	command: string;
	cwd: string;
}

export interface CupcakeToolResultInput {
	toolName: string;
	input: Record<string, unknown>;
	cwd: string;
	isError: boolean;
	output?: unknown;
	exitCode?: number;
	cancelled?: boolean;
	truncated?: boolean;
}

export function buildCupcakeToolCallEvent(input: CupcakeToolCallInput): CupcakePolicyEvent {
	return {
		hook_event_name: "PreToolUse",
		harness: "pi",
		kind: "tool_call",
		tool: input.toolName,
		cwd: input.cwd,
		args: input.input,
	};
}

export function buildCupcakeUserBashEvent(input: CupcakeUserBashInput): CupcakePolicyEvent {
	return {
		hook_event_name: "PreToolUse",
		harness: "pi",
		kind: "user_bash",
		tool: "bash",
		cwd: input.cwd,
		args: { command: input.command },
	};
}

export function buildCupcakeToolResultEvent(input: CupcakeToolResultInput): CupcakePolicyEvent {
	return {
		hook_event_name: "PostToolUse",
		harness: "pi",
		kind: "tool_result",
		tool: input.toolName,
		cwd: input.cwd,
		args: input.input,
		result: {
			isError: input.isError,
			output: input.output,
			exitCode: input.exitCode,
			cancelled: input.cancelled,
			truncated: input.truncated,
		},
	};
}
