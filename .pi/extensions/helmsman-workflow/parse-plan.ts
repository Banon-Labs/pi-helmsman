import type { ParsedWorkflowPlanResult, WorkflowApprovalState, WorkflowPlanPhase } from "./types";
import { buildReadOnlyExplorationCommands } from "./planner";

function unwrapMarkdownFormatting(value: string): string {
	let result = value.trim();
	for (const pattern of [/^\*\*(.+?)\*\*$/, /^_(.+)_$/, /^\*(.+)\*$/]) {
		const match = result.match(pattern);
		if (match) {
			result = match[1].trim();
		}
	}
	return result;
}

function normalizeSectionHeaderLine(line: string): string {
	return unwrapMarkdownFormatting(line.trim().replace(/^#{1,6}\s+/, "").replace(/\s{2,}$/g, ""));
}

function isSectionHeader(line: string, label: string): { matches: boolean; inlineValue: string | null } {
	const normalized = normalizeSectionHeaderLine(line);
	if (!normalized) return { matches: false, inlineValue: null };
	if (normalized.toLowerCase() === label.toLowerCase()) {
		return { matches: true, inlineValue: null };
	}
	const prefix = `${label}:`;
	if (normalized.toLowerCase().startsWith(prefix.toLowerCase())) {
		return { matches: true, inlineValue: normalized.slice(prefix.length).trim() || null };
	}
	return { matches: false, inlineValue: null };
}

function extractSection(text: string, label: string, stopLabels: string[]): { present: boolean; value: string | null } {
	const lines = text.split("\n");
	const startIndex = lines.findIndex((line) => isSectionHeader(line, label).matches);
	if (startIndex === -1) return { present: false, value: null };

	const startMatch = isSectionHeader(lines[startIndex] ?? "", label);
	const collected: string[] = [];
	if (startMatch.inlineValue) collected.push(startMatch.inlineValue);

	for (let index = startIndex + 1; index < lines.length; index += 1) {
		const line = lines[index] ?? "";
		const hitsStop = stopLabels.some((stopLabel) => stopLabel !== label && isSectionHeader(line, stopLabel).matches);
		if (hitsStop) break;
		collected.push(line);
	}

	const value = collected.join("\n").trim();
	return { present: true, value: value || null };
}

function parseBulletList(section: string | null): string[] {
	if (!section) return [];
	return section
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.startsWith("- "))
		.map((line) => line.slice(2).trim())
		.map((line) => line.replace(/^`(.+)`$/, "$1"))
		.filter(Boolean);
}

function normalizePlanLine(line: string): string {
	return unwrapMarkdownFormatting(
		line
			.trim()
			.replace(/^#{1,6}\s+/, "")
			.replace(/^[-*+]\s+/, "")
			.replace(/^\d+[.)]\s+/, "")
			.replace(/^\[ ?[xX]? ?\]\s+/, "")
			.replace(/\s{2,}$/g, ""),
	);
}

function parsePhases(planSection: string | null): WorkflowPlanPhase[] {
	if (!planSection) return [];
	const lines = planSection.split("\n");
	const phases: WorkflowPlanPhase[] = [];
	let current: WorkflowPlanPhase | null = null;

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line) continue;
		const normalized = normalizePlanLine(line);
		const phaseMatch = normalized.match(/^Phase\s+(\d+)\s*(?::|[-–—])\s*(.+?)(?:\s*\(\d+\s+steps\))?$/i);
		if (phaseMatch) {
			current = { name: phaseMatch[2].trim(), steps: [] };
			phases.push(current);
			continue;
		}
		if (!current) continue;

		const stepText = normalizePlanLine(line);
		const looksLikePhaseEcho = /^Phase\s+\d+\b/i.test(stepText);
		if (!stepText || looksLikePhaseEcho) continue;

		const isStepLine = /^\s*(?:[-*+]\s+|\d+[.)]\s+|\[ ?[xX]? ?\]\s+)/.test(line);
		if (isStepLine) {
			current.steps.push(stepText);
		}
	}

	return phases.filter((phase) => phase.steps.length > 0);
}

export function parseWorkflowPlanFromText(text: string): ParsedWorkflowPlanResult | null {
	const stopLabels = ["Goal", "Constraints", "Assumptions", "Target Files", "Current Phase", "Current Step", "Verification Notes", "Approval State", "Plan"];
	const goalSection = extractSection(text, "Goal", stopLabels);
	const constraintsSection = extractSection(text, "Constraints", stopLabels);
	const assumptionsSection = extractSection(text, "Assumptions", stopLabels);
	const targetFilesSection = extractSection(text, "Target Files", stopLabels);
	const currentPhaseSection = extractSection(text, "Current Phase", stopLabels);
	const currentStepSection = extractSection(text, "Current Step", stopLabels);
	const verificationSection = extractSection(text, "Verification Notes", stopLabels);
	const approvalSection = extractSection(text, "Approval State", stopLabels);
	const planSection = extractSection(text, "Plan", stopLabels);
	const constraints = parseBulletList(constraintsSection.value);
	const assumptions = parseBulletList(assumptionsSection.value);
	const targetFiles = parseBulletList(targetFilesSection.value);
	const verificationNotes = parseBulletList(verificationSection.value);
	const phases = parsePhases(planSection.value);
	const goal = goalSection.value?.split("\n")[0]?.trim() ?? "";
	const currentPhaseMatch = currentPhaseSection.value?.match(/(?:Phase\s+)?(\d+)/i);
	const currentStepMatch = currentStepSection.value?.match(/(\d+)/i);
	const approvalMatch = approvalSection.value?.match(/\b(draft|approved)\b/i);

	if (!goalSection.present && phases.length === 0) return null;

	const present = {
		goal: goalSection.present,
		currentPhase: currentPhaseSection.present,
		currentStep: currentStepSection.present,
		targetFiles: targetFilesSection.present,
		approvalState: approvalSection.present,
		constraints: constraintsSection.present,
		assumptions: assumptionsSection.present,
		verificationNotes: verificationSection.present,
		phases: planSection.present,
	};

	return {
		plan: {
			goal,
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
