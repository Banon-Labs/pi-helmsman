import type { WorkflowPlanState } from "./types";

export interface BeadsDraftAction {
	type: "create";
	draftId: string;
	title: string;
	issueType: "task" | "feature";
	priority: number;
	description: string;
	dependsOnDraftIds?: string[];
	rationale: string;
	evidence: string[];
}

export interface BeadsDraftOutput {
	adapter: "beads";
	previewText: string;
	json: string;
	actions: BeadsDraftAction[];
	warnings: string[];
}

function buildEvidence(plan: WorkflowPlanState, phaseName?: string): string[] {
	const evidence = [
		...plan.targetFiles.map((path) => `target file: ${path}`),
		...plan.verificationNotes.map((note) => `verification: ${note}`),
		...plan.constraints.map((constraint) => `constraint: ${constraint}`),
	];
	if (phaseName) evidence.unshift(`phase: ${phaseName}`);
	if (evidence.length === 0 && plan.goal) evidence.push(`goal: ${plan.goal}`);
	return evidence;
}

function buildActionDescription(plan: WorkflowPlanState, phaseName?: string, steps: string[] = []): string {
	const lines = [
		`Goal: ${plan.goal || "none"}`,
		phaseName ? `Phase: ${phaseName}` : undefined,
		plan.targetFiles.length > 0 ? `Target files: ${plan.targetFiles.join(", ")}` : undefined,
		plan.constraints.length > 0 ? `Constraints: ${plan.constraints.join(" | ")}` : undefined,
		plan.assumptions.length > 0 ? `Assumptions: ${plan.assumptions.join(" | ")}` : undefined,
		steps.length > 0 ? `Steps: ${steps.join(" | ")}` : undefined,
		plan.verificationNotes.length > 0 ? `Verification: ${plan.verificationNotes.join(" | ")}` : undefined,
	];
	return lines.filter(Boolean).join("\n");
}

export function buildBeadsDraftOutput(plan: WorkflowPlanState): BeadsDraftOutput {
	const warnings: string[] = [];
	if (plan.approvalState === "draft") {
		warnings.push("Plan approval is still draft; review before applying any Beads actions.");
	}

	const actions: BeadsDraftAction[] = plan.phases.length > 0
		? plan.phases.map((phase, index) => ({
				type: "create",
				draftId: `phase-${index + 1}`,
				title: `${phase.name} — ${plan.goal || "Helmsman plan slice"}`,
				issueType: "task",
				priority: plan.approvalState === "approved" ? 1 : 2,
				description: buildActionDescription(plan, phase.name, phase.steps),
				dependsOnDraftIds: index > 0 ? [`phase-${index}`] : undefined,
				rationale: `Phase-oriented Beads draft derived from Helmsman workflow phase ${index + 1}.`,
				evidence: buildEvidence(plan, phase.name),
			}))
		: [{
				type: "create",
				draftId: "goal-1",
				title: plan.goal || "Helmsman scoped draft",
				issueType: "task",
				priority: plan.approvalState === "approved" ? 1 : 2,
				description: buildActionDescription(plan),
				rationale: "Single scoped Beads draft derived from overall Helmsman goal because no explicit phases were present.",
				evidence: buildEvidence(plan),
			}];

	if (plan.phases.length === 0) {
		warnings.push("Plan has no explicit phases; emitted one scoped Beads create draft from the overall goal.");
	}

	const previewLines = [
		"Helmsman Beads draft preview",
		...warnings.map((warning) => `Warning: ${warning}`),
		...actions.map((action) => {
			const deps = action.dependsOnDraftIds?.length ? ` (depends on: ${action.dependsOnDraftIds.join(", ")})` : "";
			return `- Create issue draft ${action.draftId}: ${action.title}${deps}`;
		}),
	];

	return {
		adapter: "beads",
		previewText: previewLines.join("\n"),
		json: JSON.stringify({ adapter: "beads", warnings, actions }, null, 2),
		actions,
		warnings,
	};
}
