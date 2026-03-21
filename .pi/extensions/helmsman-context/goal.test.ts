import { describe, expect, test } from "bun:test";
import { chooseRouteGoal, shouldTrackAsGoal } from "./goal";

describe("shouldTrackAsGoal", () => {
	test("tracks normal user requests", () => {
		expect(shouldTrackAsGoal("inspect pi-mono and implement the change there")).toBe(true);
	});

	test("does not track slash commands as goals", () => {
		expect(shouldTrackAsGoal("/context pi-mono")).toBe(false);
		expect(shouldTrackAsGoal("/context-switch pi-mono")).toBe(false);
	});
});

describe("chooseRouteGoal", () => {
	test("prefers the last tracked user goal when command args are empty", () => {
		expect(chooseRouteGoal("", "inspect pi-mono and implement the change there", "pi-mono")).toBe(
			"inspect pi-mono and implement the change there",
		);
	});

	test("prefers explicit command args when provided", () => {
		expect(chooseRouteGoal("implement parser changes in pi-mono", "older goal", "older input")).toBe(
			"implement parser changes in pi-mono",
		);
	});

	test("falls back to last input text when no tracked goal exists", () => {
		expect(chooseRouteGoal("", "", "pi-mono")).toBe("pi-mono");
	});
});
