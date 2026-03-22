import { describe, expect, test } from "bun:test";
import { enforceCupcakeDecision, loadCupcakeRuntime } from "./runtime";

describe("loadCupcakeRuntime", () => {
	test("stays disabled when the bridge is off", async () => {
		const runtime = await loadCupcakeRuntime({
			enabled: false,
			moduleId: "@eqtylab/cupcake",
			policyDir: ".cupcake",
			harness: "claude",
			failMode: "open",
		});

		expect(runtime.ready).toBe(false);
		expect(runtime.description).toBe("disabled");
	});

	test("initializes a class-based Cupcake module", async () => {
		const initCalls: Array<[string | undefined, string | undefined]> = [];
		const evaluateCalls: unknown[] = [];
		const runtime = await loadCupcakeRuntime(
			{
				enabled: true,
				moduleId: "mock-cupcake",
				policyDir: ".cupcake",
				harness: "claude",
				failMode: "open",
			},
			async () => ({
				Cupcake: class {
					isReady = true;
					async init(path?: string, harness?: string) {
						initCalls.push([path, harness]);
					}
					async evaluate(event: unknown) {
						evaluateCalls.push(event);
						return { decision: "Allow", reason: "ok" };
					}
				},
			}),
		);

		expect(runtime.ready).toBe(true);
		expect(initCalls).toEqual([[".cupcake", "claude"]]);
		const decision = await runtime.evaluate({
			hook_event_name: "PreToolUse",
			harness: "pi",
			kind: "tool_call",
			tool: "write",
			cwd: "/repo",
			args: {},
		});
		expect(decision?.decision).toBe("Allow");
		expect(evaluateCalls).toHaveLength(1);
	});

	test("falls back to unavailable when the module import fails", async () => {
		const runtime = await loadCupcakeRuntime(
			{
				enabled: true,
				moduleId: "missing-cupcake",
				policyDir: ".cupcake",
				harness: "claude",
				failMode: "closed",
			},
			async () => {
				throw new Error("module not found");
			},
		);

		expect(runtime.ready).toBe(false);
		expect(runtime.description).toContain("unavailable: module not found");
		expect(await runtime.evaluate({
			hook_event_name: "PreToolUse",
			harness: "pi",
			kind: "user_bash",
			tool: "bash",
			cwd: "/repo",
			args: { command: "echo hi" },
		})).toBeUndefined();
	});
});

describe("enforceCupcakeDecision", () => {
	test("blocks deny decisions", () => {
		const enforcement = enforceCupcakeDecision({ decision: "Deny", reason: "nope" }, "open");
		expect(enforcement).toEqual({ allow: false, reason: "nope", severity: "warning" });
	});

	test("blocks ask decisions", () => {
		const enforcement = enforceCupcakeDecision({ decision: "Ask", question: "Need approval" }, "open");
		expect(enforcement).toEqual({ allow: false, reason: "Need approval", severity: "warning" });
	});

	test("allows unknown decisions in open mode but blocks them in closed mode", () => {
		expect(enforceCupcakeDecision({ decision: "Weird", reason: "??" }, "open").allow).toBe(true);
		expect(enforceCupcakeDecision({ decision: "Weird", reason: "??" }, "closed").allow).toBe(false);
	});

	test("blocks unavailable evaluation in closed mode", () => {
		const enforcement = enforceCupcakeDecision(undefined, "closed", "Cupcake runtime unavailable");
		expect(enforcement).toEqual({
			allow: false,
			reason: "Cupcake runtime unavailable",
			severity: "warning",
		});
	});
});
