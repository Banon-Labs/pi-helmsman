import { describe, expect, test } from "bun:test";
import { restoreTrackedGoal } from "./state";

describe("restoreTrackedGoal", () => {
	test("restores the latest tracked goal from custom entries", () => {
		const result = restoreTrackedGoal([
			{ type: "custom", customType: "helmsman-context-state", data: { lastGoalText: "older goal" } },
			{ type: "custom", customType: "other-extension", data: { lastGoalText: "ignore me" } },
			{ type: "custom", customType: "helmsman-context-state", data: { lastGoalText: "newest goal" } },
		]);

		expect(result).toBe("newest goal");
	});

	test("returns empty string when no tracked goal exists", () => {
		const result = restoreTrackedGoal([
			{ type: "custom", customType: "other-extension", data: { lastGoalText: "ignore me" } },
		]);

		expect(result).toBe("");
	});
});
