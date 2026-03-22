import { describe, expect, test } from "bun:test";
import {
	buildApprovalRequiredNotice,
	buildCollaborativeReplanNotice,
	buildPlanModeActivationNotice,
	buildPlanModeSystemPrompt,
	buildVerificationFailureNotice,
} from "./voice";

describe("helmsman workflow voice helpers", () => {
	test("plan mode system prompt reinforces collaborative read-only planning", () => {
		const prompt = buildPlanModeSystemPrompt();
		expect(prompt).toContain("Work like a careful, professional collaborator.");
		expect(prompt).toContain("Treat the current request as planning work");
		expect(prompt).toContain("Surface assumptions and uncertainty plainly");
		expect(prompt).toContain("fetch_web");
	});

	test("activation notice emphasizes read-only behavior and clarification", () => {
		expect(buildPlanModeActivationNotice()).toContain("stay read-only");
		expect(buildPlanModeActivationNotice()).toContain("clarification");
	});

	test("replan notice sounds collaborative instead of scolding", () => {
		expect(buildCollaborativeReplanNotice("Scope expanded.")).toBe(
			"Scope expanded. I’m moving us back to plan mode so we can confirm the next step together.",
		);
	});

	test("approval-required notice gives a clear next action", () => {
		expect(buildApprovalRequiredNotice("/run requires an approved plan before execution can begin.")).toContain(
			"Review the current plan and approve it",
		);
	});

	test("verification failure notice explains the reassessment path", () => {
		expect(buildVerificationFailureNotice("Verification command failed.")).toContain(
			"returned to planning so we can reassess",
		);
	});
});
