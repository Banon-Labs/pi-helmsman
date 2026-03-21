import { join, normalize } from "node:path";

export interface DetectSuggestedFolderInput {
	targetRepoRoot: string;
	inputText: string;
}

const RELATIVE_FOLDER_PATTERN = /\b([a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+)\b/g;

function cleanPathCandidate(value: string): string {
	return value.replace(/[),.:;!?]+$/g, "");
}

export function detectSuggestedFolder(input: DetectSuggestedFolderInput): string | undefined {
	const absolutePrefix = `${input.targetRepoRoot}/`;
	const absoluteIndex = input.inputText.indexOf(absolutePrefix);
	if (absoluteIndex >= 0) {
		const tail = input.inputText.slice(absoluteIndex).split(/\s+/)[0] ?? "";
		return cleanPathCandidate(tail);
	}

	for (const match of input.inputText.matchAll(RELATIVE_FOLDER_PATTERN)) {
		const candidate = cleanPathCandidate(match[1] ?? "");
		if (!candidate || candidate.startsWith("./") || candidate.startsWith("../")) continue;
		return normalize(join(input.targetRepoRoot, candidate));
	}

	return undefined;
}
