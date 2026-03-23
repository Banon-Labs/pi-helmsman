import { describe, expect, test } from "bun:test";
import {
	buildApprovalRequiredNotice,
	buildCollaborativeReplanNotice,
	buildPlanModeActivationNotice,
	buildPlanModeSystemPrompt,
	buildVerificationFailureNotice,
	getApprovalRequiredChoices,
	getCollaborativeReplanChoices,
	getVerificationFailureChoices,
} from "./voice";

describe("helmsman workflow voice helpers", () => {
	test("plan mode system prompt reinforces collaborative read-only planning", () => {
		const prompt = buildPlanModeSystemPrompt();
		expect(prompt).toContain("Work like a careful, professional collaborator.");
		expect(prompt).toContain("Treat the current request as planning work");
		expect(prompt).toContain("Surface assumptions and uncertainty plainly");
		expect(prompt).toContain("fetch_web");
		expect(prompt).toContain("search_web");
	});

	test("activation notice emphasizes read-only behavior and clarification", () => {
		expect(buildPlanModeActivationNotice()).toContain("stay read-only");
		expect(buildPlanModeActivationNotice()).toContain("clarification");
	});

	test("replan notice stays focused while the select helper owns the choice labels", () => {
		const notice = buildCollaborativeReplanNotice("Scope expanded.");
		expect(notice).toContain("Scope expanded. I’m moving us back to plan mode so we can confirm the next step together.");
		expect(getCollaborativeReplanChoices()).toEqual([
			"Review the updated plan.",
			"Stay in plan mode with the current draft.",
			"Something else",
		]);
	});

	test("approval-required notice and choices expose the exact Something else branch", () => {
		const notice = buildApprovalRequiredNotice("/run requires an approved plan before execution can begin.");
		expect(notice).toContain("Review the current plan and approve it");
		expect(getApprovalRequiredChoices()).toEqual([
			"Approve the current plan.",
			"Revise the plan before execution.",
			"Something else",
		]);
	});

	test("verification failure notice and choices preserve reassessment wording", () => {
		const notice = buildVerificationFailureNotice("Verification command failed.");
		expect(notice).toContain("returned to planning so we can reassess");
		expect(getVerificationFailureChoices()).toEqual([
			"Review the failure and adjust the plan.",
			"Revise the validation approach before retrying.",
			"Something else",
		]);
	});
});
