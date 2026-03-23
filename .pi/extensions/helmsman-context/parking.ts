import { buildParkedWorkflowPlan } from "../helmsman-workflow/state.js";
import type { WorkflowPlanState } from "../helmsman-workflow/types.js";

export interface ParkedStashEntry {
	ref: string;
	message: string;
}

export interface ResolvedParkedWorkflowTargets {
	activeTargetFiles: string[];
	parkedTargetFiles: string[];
	targetFiles: string[];
	parkedPlan?: WorkflowPlanState;
	parkedStash?: ParkedStashEntry;
}

const PARKED_WORKFLOW_STASH_MARKER = /dirty-worktree park/i;

function uniqueStrings(items: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];
	for (const item of items) {
		const trimmed = item.trim();
		if (!trimmed || seen.has(trimmed)) continue;
		seen.add(trimmed);
		result.push(trimmed);
	}
	return result;
}

export function parseStashList(output: string): ParkedStashEntry[] {
	return output
		.split("\n")
		.map((line) => line.replace(/\r$/, "").trim())
		.filter(Boolean)
		.map((line) => {
			const separator = line.indexOf("\t");
			if (separator === -1) {
				const fallbackSeparator = line.indexOf(": ");
				if (fallbackSeparator === -1) return undefined;
				return {
					ref: line.slice(0, fallbackSeparator).trim(),
					message: line.slice(fallbackSeparator + 2).trim(),
				};
			}
			return {
				ref: line.slice(0, separator).trim(),
				message: line.slice(separator + 1).trim(),
			};
		})
		.filter((entry): entry is ParkedStashEntry => Boolean(entry?.ref && entry.message));
}

export function parseStashFileList(output: string): string[] {
	return uniqueStrings(
		output
			.split("\n")
			.map((line) => line.replace(/\r$/, "").trim())
			.filter(Boolean),
	);
}

export function findTraceableParkedStash(entries: ParkedStashEntry[]): ParkedStashEntry | undefined {
	return entries.find((entry) => PARKED_WORKFLOW_STASH_MARKER.test(entry.message));
}

export function resolveParkedWorkflowTargets(
	activeTargetFiles: string[],
	stashListOutput: string,
	stashFilesOutput: string,
): ResolvedParkedWorkflowTargets {
	const activeTargets = uniqueStrings(activeTargetFiles);
	const stashEntries = parseStashList(stashListOutput);
	const parkedStash = findTraceableParkedStash(stashEntries);
	const parkedTargetFiles = parkedStash ? parseStashFileList(stashFilesOutput) : [];
	const targetFiles = uniqueStrings([...activeTargets, ...parkedTargetFiles]);
	return {
		activeTargetFiles: activeTargets,
		parkedTargetFiles,
		targetFiles,
		parkedPlan: parkedStash && parkedTargetFiles.length > 0
			? buildParkedWorkflowPlan(parkedStash.ref, parkedTargetFiles, parkedStash.message)
			: undefined,
		parkedStash,
	};
}
