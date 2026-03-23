function normalizeRepoPath(path: string): string {
	return path.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\//, "");
}

const TRANSIENT_PATH_PATTERNS = [
	/^\.cupcake(?:\/|$)/,
	/^\.opencode(?:\/|$)/,
	/^\.beads\/push-state\.json$/,
];

export type DirtyPathKind = "tracked" | "untracked";
export type DirtyPathDisposition = "in-scope" | "transient" | "unrelated";

export interface DirtyPathEntry {
	path: string;
	kind: DirtyPathKind;
	rawStatus: string;
	disposition: DirtyPathDisposition;
}

export interface DirtyWorktreeAssessment {
	entries: DirtyPathEntry[];
	inScopeEntries: DirtyPathEntry[];
	transientEntries: DirtyPathEntry[];
	blockingEntries: DirtyPathEntry[];
	summary: string;
	blocksMutation: boolean;
}

export function parseGitStatusPorcelain(output: string): Array<{ path: string; kind: DirtyPathKind; rawStatus: string }> {
	return output
		.split("\n")
		.map((line) => line.replace(/\r$/, ""))
		.map((line) => line.trimEnd())
		.filter(Boolean)
		.filter((line) => !line.startsWith("!!"))
		.map((line) => {
			const rawStatus = line.slice(0, 2);
			const payload = line.slice(3).trim();
			const path = payload.includes(" -> ") ? payload.split(" -> ").pop() ?? payload : payload;
			return {
				path,
				kind: rawStatus === "??" ? "untracked" : "tracked",
				rawStatus,
			};
		});
}

export function classifyDirtyPath(path: string, targetFiles: string[]): DirtyPathDisposition {
	const normalized = normalizeRepoPath(path);
	if (TRANSIENT_PATH_PATTERNS.some((pattern) => pattern.test(normalized))) return "transient";
	const normalizedTargets = targetFiles.map((target) => normalizeRepoPath(target)).filter(Boolean);
	if (
		normalizedTargets.some(
			(target) => normalized === target || normalized.endsWith(`/${target}`) || target.endsWith(`/${normalized}`),
		)
	) {
		return "in-scope";
	}
	return "unrelated";
}

function summarize(entries: DirtyPathEntry[]): string {
	if (entries.length === 0) return "Worktree clean.";
	const counts = {
		blocking: entries.filter((entry) => entry.disposition === "unrelated").length,
		inScope: entries.filter((entry) => entry.disposition === "in-scope").length,
		transient: entries.filter((entry) => entry.disposition === "transient").length,
	};
	return `Dirty worktree: ${counts.blocking} unrelated, ${counts.inScope} in-scope, ${counts.transient} transient path(s).`;
}

export function assessDirtyWorktree(output: string, targetFiles: string[]): DirtyWorktreeAssessment {
	const entries = parseGitStatusPorcelain(output).map((entry) => ({
		...entry,
		disposition: classifyDirtyPath(entry.path, targetFiles),
	}));
	const inScopeEntries = entries.filter((entry) => entry.disposition === "in-scope");
	const transientEntries = entries.filter((entry) => entry.disposition === "transient");
	const blockingEntries = entries.filter((entry) => entry.disposition === "unrelated");
	return {
		entries,
		inScopeEntries,
		transientEntries,
		blockingEntries,
		summary: summarize(entries),
		blocksMutation: blockingEntries.length > 0,
	};
}

export function formatDirtyWorktreeAssessment(assessment: DirtyWorktreeAssessment): string {
	const formatSection = (label: string, entries: DirtyPathEntry[]) => [
		`${label}:`,
		entries.length > 0 ? entries.map((entry) => `- ${entry.path} (${entry.kind}, ${entry.rawStatus.trim() || "clean"})`).join("\n") : "- none",
	].join("\n");

	return [
		assessment.summary,
		formatSection("Blocking paths", assessment.blockingEntries),
		formatSection("In-scope paths", assessment.inScopeEntries),
		formatSection("Transient paths", assessment.transientEntries),
	].join("\n\n");
}
