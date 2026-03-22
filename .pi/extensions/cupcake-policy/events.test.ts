import { describe, expect, test } from "bun:test";
import {
	buildCupcakeToolCallEvent,
	buildCupcakeToolResultEvent,
	buildCupcakeUserBashEvent,
} from "./events";

describe("cupcake policy event builders", () => {
	test("builds a pre-tool event for tool calls", () => {
		const event = buildCupcakeToolCallEvent({
			toolName: "write",
			input: { path: "notes.txt" },
			cwd: "/repo",
		});

		expect(event).toEqual({
			hook_event_name: "PreToolUse",
			harness: "pi",
			kind: "tool_call",
			tool: "write",
			cwd: "/repo",
			args: { path: "notes.txt" },
		});
	});

	test("builds a pre-tool event for user bash", () => {
		const event = buildCupcakeUserBashEvent({
			command: "git push",
			cwd: "/repo",
		});

		expect(event).toEqual({
			hook_event_name: "PreToolUse",
			harness: "pi",
			kind: "user_bash",
			tool: "bash",
			cwd: "/repo",
			args: { command: "git push" },
		});
	});

	test("builds a post-tool event for tool results", () => {
		const event = buildCupcakeToolResultEvent({
			toolName: "bash",
			input: { command: "npm test" },
			cwd: "/repo",
			isError: true,
			output: "failed",
			exitCode: 1,
			cancelled: false,
			truncated: false,
		});

		expect(event).toEqual({
			hook_event_name: "PostToolUse",
			harness: "pi",
			kind: "tool_result",
			tool: "bash",
			cwd: "/repo",
			args: { command: "npm test" },
			result: {
				isError: true,
				output: "failed",
				exitCode: 1,
				cancelled: false,
				truncated: false,
			},
		});
	});
});
