import type { ParsedWorkflowPlanResult, WorkflowApprovalState, WorkflowPlanPhase } from "./types";
import { buildReadOnlyExplorationCommands } from "./planner";

function extractSection(text: string, label: string, stopLabels: string[]): { present: boolean; value: string | null } {
	const escapedStops = stopLabels.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
	const pattern = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n(?:${escapedStops}):|$)`, "i");
	const match = text.match(pattern);
	return { present: Boolean(match), value: match?.[1]?.trim() || null };
}

function parseBulletList(section: string | null): string[] {
	if (!section) return [];
	return section
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.startsWith("- "))
		.map((line) => line.slice(2).trim())
		.filter(Boolean);
}

function parsePhases(planSection: string | null): WorkflowPlanPhase[] {
	if (!planSection) return [];
	const lines = planSection.split("\n");
	const phases: WorkflowPlanPhase[] = [];
	let current: WorkflowPlanPhase | null = null;

	for (const rawLine of lines) {
		const line = rawLine.trim();
		const phaseMatch = line.match(/^Phase\s+\d+:\s*(.+)$/i);
		if (phaseMatch) {
			current = { name: phaseMatch[1].trim(), steps: [] };
			phases.push(current);
			continue;
		}
		const stepMatch = line.match(/^\d+\.\s+(.+)$/);
		if (stepMatch && current) {
			current.steps.push(stepMatch[1].trim());
		}
	}

	return phases.filter((phase) => phase.steps.length > 0);
}

export function parseWorkflowPlanFromText(text: string): ParsedWorkflowPlanResult | null {
	const stopLabels = ["Goal", "Constraints", "Assumptions", "Target Files", "Current Phase", "Current Step", "Verification Notes", "Approval State", "Plan"];
	const goalMatch = text.match(/Goal:\s*(.+)/i);
	const approvalMatch = text.match(/Approval State:\s*(draft|approved)/i);
	const currentPhaseMatch = text.match(/Current Phase:\s*(\d+)/i);
	const currentStepMatch = text.match(/Current Step:\s*(\d+)/i);
	const constraintsSection = extractSection(text, "Constraints", stopLabels);
	const assumptionsSection = extractSection(text, "Assumptions", stopLabels);
	const targetFilesSection = extractSection(text, "Target Files", stopLabels);
	const verificationSection = extractSection(text, "Verification Notes", stopLabels);
	const planSection = extractSection(text, "Plan", stopLabels);
	const constraints = parseBulletList(constraintsSection.value);
	const assumptions = parseBulletList(assumptionsSection.value);
	const targetFiles = parseBulletList(targetFilesSection.value);
	const verificationNotes = parseBulletList(verificationSection.value);
	const phases = parsePhases(planSection.value);

	if (!goalMatch && phases.length === 0) return null;

		const present = {
		goal: Boolean(goalMatch),
		currentPhase: Boolean(currentPhaseMatch),
		currentStep: Boolean(currentStepMatch),
		targetFiles: targetFilesSection.present,
		approvalState: Boolean(approvalMatch),
		constraints: constraintsSection.present,
		assumptions: assumptionsSection.present,
		verificationNotes: verificationSection.present,
		phases: planSection.present,
	};

	return {
		plan: {
			goal: goalMatch?.[1]?.trim() ?? "",
			currentPhase: currentPhaseMatch ? Number(currentPhaseMatch[1]) : phases.length > 0 ? 1 : null,
			currentStep: currentStepMatch ? Number(currentStepMatch[1]) : phases[0]?.steps.length ? 1 : null,
			targetFiles,
			approvalState: (approvalMatch?.[1]?.toLowerCase() as WorkflowApprovalState | undefined) ?? "draft",
			constraints,
			assumptions,
			verificationNotes,
			explorationCommands: present.targetFiles ? buildReadOnlyExplorationCommands(targetFiles) : [],
			phases,
		},
		present,
	};
}
