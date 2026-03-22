import type { WorkflowPlanState } from "./types";

function formatBullets(items: string[]): string {
	return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- none";
}

function formatPlan(plan: WorkflowPlanState): string {
	if (plan.phases.length === 0) {
		return "Phase 1: Pending\n1. Define the next concrete planning step";
	}

	return plan.phases
		.map(
			(phase, phaseIndex) =>
				`Phase ${phaseIndex + 1}: ${phase.name}\n${phase.steps
					.map((step, stepIndex) => `${stepIndex + 1}. ${step}`)
					.join("\n")}`,
		)
		.join("\n");
}

export function renderWorkflowPlanDraft(plan: WorkflowPlanState): string {
	return [
		`Goal: ${plan.goal || "none"}`,
		`Constraints:\n${formatBullets(plan.constraints)}`,
		`Assumptions:\n${formatBullets(plan.assumptions)}`,
		`Target Files:\n${formatBullets(plan.targetFiles)}`,
		`Current Phase: ${plan.currentPhase ?? "none"}`,
		`Current Step: ${plan.currentStep ?? "none"}`,
		`Verification Notes:\n${formatBullets(plan.verificationNotes)}`,
		`Approval State: ${plan.approvalState}`,
		`Plan:\n${formatPlan(plan)}`,
	].join("\n");
}
