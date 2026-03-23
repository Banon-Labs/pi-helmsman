import { describe, expect, test } from "bun:test";
import { resolveForcedChoiceSelection } from "./choices";

const CHOICES = ["First", "Second", "Something else"] as const;

describe("resolveForcedChoiceSelection", () => {
	test("maps the first and second suggested branches directly", () => {
		expect(resolveForcedChoiceSelection("First", CHOICES)).toEqual({ kind: "first" });
		expect(resolveForcedChoiceSelection("Second", CHOICES)).toEqual({ kind: "second" });
	});

	test("keeps typed Something else follow-up after trimming", () => {
		expect(resolveForcedChoiceSelection("Something else", CHOICES, "  use the parser path  ")).toEqual({
			kind: "other",
			text: "use the parser path",
		});
	});

	test("treats blank Something else follow-up as an explicit empty branch", () => {
		expect(resolveForcedChoiceSelection("Something else", CHOICES, "   ")).toEqual({ kind: "other-empty" });
	});

	test("returns undefined for cancellation or unexpected selections", () => {
		expect(resolveForcedChoiceSelection(undefined, CHOICES)).toBeUndefined();
		expect(resolveForcedChoiceSelection("Unexpected", CHOICES)).toBeUndefined();
	});
});
