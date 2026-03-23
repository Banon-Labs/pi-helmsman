import type { WorkflowMode, WorkflowPlanState } from "./types";

export const CONTEXT_CONTINUATION_ROUTE_MARKER = "[Helmsman continuation route]";

export type WorkflowExecutionScope = "step" | "run";

export interface WorkflowExecutionResult {
	plan: WorkflowPlanState;
	summary: string;
}

const VERIFICATION_COMMAND_PATTERNS = [
	/^bun\s+(?:test|x\s+(?:vitest|jest|tsx|tsc)\b)/i,
	/^npm\s+run\s+(?:test|lint|check|build|typecheck)\b/i,
	/^npm\s+(?:test|run-script\s+(?:test|lint|check|build|typecheck))\b/i,
	/^pnpm\s+(?:test|lint|check|build|typecheck|exec\s+(?:vitest|jest|tsc))\b/i,
	/^yarn\s+(?:test|lint|check|build|typecheck|vitest|jest|tsc)\b/i,
	/^(?:npx|pnpm\s+dlx)\s+(?:vitest|jest|tsc|eslint|prettier)\b/i,
	/^(?:vitest|jest|mocha|ava|pytest|ruff|mypy|tox|nox)\b/i,
	/^cargo\s+(?:test|check|clippy|build)\b/i,
	/^go\s+(?:test|vet|build)\b/i,
	/^deno\s+(?:test|check|task\s+(?:test|lint|build))\b/i,
	/^uv\s+run\s+(?:pytest|ruff|mypy)\b/i,
	/^python(?:3)?\s+-m\s+(?:pytest|unittest)\b/i,
	/^tsc\b/i,
	/^(?:make|just)\s+(?:test|check|lint|build)\b/i,
];

export function isVerificationCommand(command: string): boolean {
	const trimmed = command.trim();
	if (!trimmed) return false;
	return VERIFICATION_COMMAND_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function getVerificationFailureReason(command: string): string | undefined {
	if (!isVerificationCommand(command)) return undefined;
	return `Verification command failed: ${command.trim()}.`;
}

export function buildVerificationFailureNote(command: string): string {
	return `Verification failed: ${command.trim()}`;
}

export function isWorkflowContinuationIntent(text: string): boolean {
	const normalized = text.trim().toLowerCase();
	return normalized === "continue" || normalized === "engage";
}

export function getBuildModePromptTransform(text: string): string | undefined {
	return isWorkflowContinuationIntent(text) ? "/step" : undefined;
}

export function getWorkflowInputTransform(mode: WorkflowMode, text: string): string | undefined {
	if (mode !== "build") return undefined;
	return getBuildModePromptTransform(text) ?? (text.includes(CONTEXT_CONTINUATION_ROUTE_MARKER) ? "/step" : undefined);
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

export function shouldReplanAfterExecutionBlock(
	plan: WorkflowPlanState,
	scope: WorkflowExecutionScope,
): boolean {
	return Boolean(getExecutionBlockReason(plan, scope)) && plan.approvalState === "approved";
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
