import { describe, expect, test } from "bun:test";
import { describePlannerRuntime } from "./runtime";

describe("describePlannerRuntime", () => {
	test("reports ready when a model is selected", () => {
		expect(describePlannerRuntime(true)).toBe("Planner runtime: ready (model selected)");
	});

	test("reports blocked when no model is selected", () => {
		expect(describePlannerRuntime(false)).toBe(
			"Planner runtime: blocked (no model selected; draft scaffold and prompts only)",
		);
	});
});
