import { describe, expect, test } from "bun:test";
import {
	buildApprovalRequiredNotice,
	buildCollaborativeReplanNotice,
	buildPlanModeActivationNotice,
	buildPlanModeSystemPrompt,
	buildRiskyStepEvidencePolicyPrompt,
	buildStrictStructuredPlanPrompt,
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
		expect(prompt).toContain("require a visible evidence-first verification packet before any administrative or completion action");
		expect(prompt).toContain("show concrete RTK command outputs");
		expect(prompt).toContain("Present raw evidence first, then a separate cross-check section");
		expect(prompt).toContain("Fail closed");
		expect(prompt).toContain("Return only a strict Helmsman-compatible /plan string.");
		expect(prompt).toContain("Goal:");
		expect(prompt).toContain("Constraints:");
		expect(prompt).toContain("Assumptions:");
		expect(prompt).toContain("Target Files:");
		expect(prompt).toContain("Current Phase:");
		expect(prompt).toContain("Plan:");
		expect(prompt).toContain("Verification Notes:");
		expect(prompt).toContain("Approval State:");
		expect(prompt).toContain("Do not add prose before or after the structured plan.");
	});

	test("risky-step evidence policy prompt requires explicit evidence and fail-closed gating", () => {
		const prompt = buildRiskyStepEvidencePolicyPrompt();
		expect(prompt).toContain("closing or reopening a bd issue");
		expect(prompt).toContain("claiming completion");
		expect(prompt).toContain("show concrete RTK command outputs");
		expect(prompt).toContain("direct parser/draft inspection");
		expect(prompt).toContain("runtime smoke evidence when behavior changed");
		expect(prompt).toContain("Present raw evidence first, then a separate cross-check section");
		expect(prompt).toContain("Fail closed");
		expect(prompt).toContain("pre-mutation confidence checkpoint");
	});

	test("strict structured plan prompt enumerates the required schema in order", () => {
		const prompt = buildStrictStructuredPlanPrompt();
		const expectedOrder = [
			"Goal:",
			"Constraints:",
			"Assumptions:",
			"Target Files:",
			"Current Phase:",
			"Plan:",
			"Verification Notes:",
			"Approval State:",
		];
		let lastIndex = -1;
		for (const header of expectedOrder) {
			const index = prompt.indexOf(header);
			expect(index).toBeGreaterThan(lastIndex);
			lastIndex = index;
		}
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
