import type { WorkflowApprovalState, WorkflowPlanPhase, WorkflowPlanState } from "./types";
import { buildReadOnlyExplorationCommands } from "./planner";

function extractSection(text: string, label: string, stopLabels: string[]): string | null {
	const escapedStops = stopLabels.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
	const pattern = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n(?:${escapedStops}):|$)`, "i");
	const match = text.match(pattern);
	return match?.[1]?.trim() || null;
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

export function parseWorkflowPlanFromText(text: string): WorkflowPlanState | null {
	const stopLabels = ["Goal", "Constraints", "Assumptions", "Target Files", "Current Phase", "Verification Notes", "Approval State", "Plan"];
	const goalMatch = text.match(/Goal:\s*(.+)/i);
	const approvalMatch = text.match(/Approval State:\s*(draft|approved)/i);
	const currentPhaseMatch = text.match(/Current Phase:\s*(\d+)/i);
	const constraints = parseBulletList(extractSection(text, "Constraints", stopLabels));
	const assumptions = parseBulletList(extractSection(text, "Assumptions", stopLabels));
	const targetFiles = parseBulletList(extractSection(text, "Target Files", stopLabels));
	const verificationNotes = parseBulletList(extractSection(text, "Verification Notes", stopLabels));
	const phases = parsePhases(extractSection(text, "Plan", stopLabels));

	if (!goalMatch && phases.length === 0) return null;

	return {
		goal: goalMatch?.[1]?.trim() ?? "",
		currentPhase: currentPhaseMatch ? Number(currentPhaseMatch[1]) : phases.length > 0 ? 1 : null,
		currentStep: phases[0]?.steps.length ? 1 : null,
		targetFiles,
		approvalState: (approvalMatch?.[1]?.toLowerCase() as WorkflowApprovalState | undefined) ?? "draft",
		constraints,
		assumptions,
		verificationNotes,
		explorationCommands: buildReadOnlyExplorationCommands(targetFiles),
		phases,
	};
}
