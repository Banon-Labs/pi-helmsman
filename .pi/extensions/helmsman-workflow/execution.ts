import type { WorkflowPlanState } from "./types";

export type WorkflowExecutionScope = "step" | "run";

export interface WorkflowExecutionResult {
	plan: WorkflowPlanState;
	summary: string;
}

export function getExecutionBlockReason(
	plan: WorkflowPlanState,
	scope: WorkflowExecutionScope,
): string | undefined {
	if (plan.approvalState !== "approved") {
		return `/${scope} requires an approved plan before execution can begin.`;
	}
	if (plan.phases.length === 0) {
		return `/${scope} requires a phased plan before execution can begin.`;
	}
	if (!plan.currentPhase || !plan.currentStep) {
		return `/${scope} requires current phase and step pointers before execution can begin.`;
	}
	const phase = plan.phases[plan.currentPhase - 1];
	if (!phase || phase.steps.length === 0) {
		return `/${scope} requires the current phase to contain executable steps.`;
	}
	return undefined;
}

export function advanceWorkflowPlanForStep(plan: WorkflowPlanState): WorkflowExecutionResult {
	const phaseIndex = Math.max((plan.currentPhase ?? 1) - 1, 0);
	const stepIndex = Math.max((plan.currentStep ?? 1) - 1, 0);
	const phase = plan.phases[phaseIndex];
	if (!phase) {
		return { plan, summary: "No current phase is available for execution." };
	}

	if (stepIndex + 1 < phase.steps.length) {
		return {
			plan: {
				...plan,
				currentPhase: phaseIndex + 1,
				currentStep: stepIndex + 2,
			},
			summary: `Advanced to step ${stepIndex + 2} of phase ${phaseIndex + 1}.`,
		};
	}

	if (phaseIndex + 1 < plan.phases.length) {
		return {
			plan: {
				...plan,
				currentPhase: phaseIndex + 2,
				currentStep: 1,
			},
			summary: `Completed phase ${phaseIndex + 1} and advanced to phase ${phaseIndex + 2}, step 1.`,
		};
	}

	return {
		plan: {
			...plan,
			currentPhase: phaseIndex + 1,
			currentStep: phase.steps.length,
		},
		summary: "Plan execution is already at the final step.",
	};
}

export function advanceWorkflowPlanForRun(plan: WorkflowPlanState): WorkflowExecutionResult {
	const phaseIndex = Math.max((plan.currentPhase ?? 1) - 1, 0);
	const phase = plan.phases[phaseIndex];
	if (!phase) {
		return { plan, summary: "No current phase is available for execution." };
	}

	if (phaseIndex + 1 < plan.phases.length) {
		return {
			plan: {
				...plan,
				currentPhase: phaseIndex + 2,
				currentStep: 1,
			},
			summary: `Completed phase ${phaseIndex + 1} and advanced to phase ${phaseIndex + 2}.`,
		};
	}

	return {
		plan: {
			...plan,
			currentPhase: phaseIndex + 1,
			currentStep: phase.steps.length,
		},
		summary: "Completed the final phase; no further phases remain.",
	};
}
