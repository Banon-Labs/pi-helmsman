import { existsSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

export interface DetectSuggestedFolderInput {
	targetRepoRoot: string;
	inputText: string;
}

export interface SuggestedFolderHint {
	path: string;
	source: "absolute" | "relative";
	basis: "directory" | "file-parent" | "unverified";
}

const RELATIVE_FOLDER_PATTERN = /\b([a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+)\b/g;

function cleanPathCandidate(value: string): string {
	return value.replace(/[),:;!?]+$/g, "");
}

function describeCandidatePath(path: string): Pick<SuggestedFolderHint, "path" | "basis"> {
	if (!existsSync(path)) {
		return {
			path,
			basis: "unverified",
		};
	}

	const stat = statSync(path);
	if (stat.isDirectory()) {
		return {
			path,
			basis: "directory",
		};
	}

	return {
		path: dirname(path),
		basis: "file-parent",
	};
}

export function detectSuggestedFolder(input: DetectSuggestedFolderInput): SuggestedFolderHint | undefined {
	const absolutePrefix = `${input.targetRepoRoot}/`;
	const absoluteIndex = input.inputText.indexOf(absolutePrefix);
	if (absoluteIndex >= 0) {
		const tail = input.inputText.slice(absoluteIndex).split(/\s+/)[0] ?? "";
		const described = describeCandidatePath(cleanPathCandidate(tail));
		return {
			...described,
			source: "absolute",
		};
	}

	for (const match of input.inputText.matchAll(RELATIVE_FOLDER_PATTERN)) {
		const candidate = cleanPathCandidate(match[1] ?? "");
		if (!candidate || candidate.startsWith("./") || candidate.startsWith("../")) continue;
		const described = describeCandidatePath(normalize(join(input.targetRepoRoot, candidate)));
		return {
			...described,
			source: "relative",
		};
	}

	return undefined;
}
