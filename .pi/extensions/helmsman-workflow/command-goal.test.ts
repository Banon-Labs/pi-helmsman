import { describe, expect, test } from "bun:test";
import { normalizeRequestedPlanGoal, shouldPromptForPlanGoal } from "./command-goal";

describe("shouldPromptForPlanGoal", () => {
	test("prompts when no command args and no existing goal", () => {
		expect(shouldPromptForPlanGoal("", "")).toBe(true);
	});

	test("does not prompt when command args already provide a goal", () => {
		expect(shouldPromptForPlanGoal("add planning support", "")).toBe(false);
	});

	test("does not prompt when an existing goal already exists", () => {
		expect(shouldPromptForPlanGoal("", "existing plan goal")).toBe(false);
	});
});

describe("normalizeRequestedPlanGoal", () => {
	test("prefers command args when present", () => {
		expect(normalizeRequestedPlanGoal("new goal", "old goal")).toBe("new goal");
	});

	test("falls back to existing goal when args are empty", () => {
		expect(normalizeRequestedPlanGoal("", "old goal")).toBe("old goal");
	});
});
