import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import type { RepoCandidate } from "./types.js";

function hasMarker(path: string, marker: string): boolean {
	return existsSync(join(path, marker));
}

export function findRepoRoot(startCwd: string): string | undefined {
	let current = resolve(startCwd);
	while (true) {
		if (hasMarker(current, ".git")) return current;
		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

function createCandidate(repoRoot: string, currentRepoRoot?: string): RepoCandidate {
	return {
		repoRoot,
		repoName: basename(repoRoot),
		hasBeads: hasMarker(repoRoot, ".beads"),
		isCurrent: repoRoot === currentRepoRoot,
		score: 0,
		reasons: [],
	};
}

export async function discoverRepoCandidates(workspaceRoot: string, currentRepoRoot?: string): Promise<RepoCandidate[]> {
	const roots = new Set<string>();
	const entries = await readdir(workspaceRoot, { withFileTypes: true });
	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		const repoRoot = join(workspaceRoot, entry.name);
		if (hasMarker(repoRoot, ".git")) roots.add(repoRoot);
	}
	if (currentRepoRoot) roots.add(currentRepoRoot);
	return Array.from(roots).sort().map((repoRoot) => createCandidate(repoRoot, currentRepoRoot));
}
