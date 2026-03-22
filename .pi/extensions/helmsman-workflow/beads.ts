import type { WorkflowPlanState } from "./types";

export interface BeadsDraftOptions {
	currentIssueId?: string;
	closeIssue?: boolean;
}

export interface BeadsCreateDraftAction {
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

export interface BeadsUpdateDraftAction {
	type: "update";
	issueId: string;
	status?: string;
	priority?: number;
	rationale: string;
	evidence: string[];
}

export interface BeadsCommentDraftAction {
	type: "comment";
	issueId: string;
	text: string;
	rationale: string;
	evidence: string[];
}

export interface BeadsCloseDraftAction {
	type: "close";
	issueId: string;
	reason: string;
	rationale: string;
	evidence: string[];
}

export type BeadsDraftAction =
	| BeadsCreateDraftAction
	| BeadsUpdateDraftAction
	| BeadsCommentDraftAction
	| BeadsCloseDraftAction;

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

function isScopedIssueUpdateCandidate(plan: WorkflowPlanState, options: BeadsDraftOptions): boolean {
	return Boolean(options.currentIssueId) && plan.targetFiles.length <= 2;
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

export function parseBeadsDraftArgs(args: string): BeadsDraftOptions {
	const trimmed = args.trim();
	if (!trimmed) return {};
	const parts = trimmed.split(/\s+/);
	const closeIssue = parts.includes("--close");
	const currentIssueId = parts.find((part) => part !== "--close");
	return {
		currentIssueId,
		closeIssue: closeIssue || undefined,
	};
}

export function buildBeadsDraftOutput(plan: WorkflowPlanState, options: BeadsDraftOptions = {}): BeadsDraftOutput {
	const warnings: string[] = [];
	if (plan.approvalState === "draft") {
		warnings.push("Plan approval is still draft; review before applying any Beads actions.");
	}

	const actions: BeadsDraftAction[] = isScopedIssueUpdateCandidate(plan, options)
		? [
				{
					type: "update",
					issueId: options.currentIssueId,
					status: "in_progress",
					priority: plan.approvalState === "approved" ? 1 : 2,
					rationale: "Scoped Helmsman plan mapped to an update draft for the explicitly targeted Beads issue.",
					evidence: buildEvidence(plan),
				},
				{
					type: "comment",
					issueId: options.currentIssueId,
					text: buildActionDescription(plan),
					rationale: "Scoped Helmsman plan mapped to a comment draft for the explicitly targeted Beads issue.",
					evidence: buildEvidence(plan),
				},
				...(options.closeIssue
					? [{
						type: "close" as const,
						issueId: options.currentIssueId,
						reason: "Completed",
						rationale: "Explicit close intent requested for the targeted Beads issue after scoped Helmsman review.",
						evidence: buildEvidence(plan),
					}]
					: []),
			]
		: plan.phases.length > 0
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

	if (!isScopedIssueUpdateCandidate(plan, options) && !options.currentIssueId && plan.phases.length === 0) {
		warnings.push("Plan has no explicit phases; emitted one scoped Beads create draft from the overall goal.");
	}

	const previewLines = [
		"Helmsman Beads draft preview",
		...warnings.map((warning) => `Warning: ${warning}`),
		...actions.map((action) => {
			if (action.type === "create") {
				const deps = action.dependsOnDraftIds?.length ? ` (depends on: ${action.dependsOnDraftIds.join(", ")})` : "";
				return `- Create issue draft ${action.draftId}: ${action.title}${deps}`;
			}
			if (action.type === "update") {
				return `- Update issue ${action.issueId}: status=${action.status ?? "unchanged"}, priority=${action.priority ?? "unchanged"}`;
			}
			if (action.type === "close") {
				return `- Close issue draft ${action.issueId}: ${action.reason}`;
			}
			return `- Add comment draft for ${action.issueId}: ${action.text.split("\n")[0]}`;
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
