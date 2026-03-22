import type { WorkflowMode } from "./types";
import { isReadOnlyBashCommand } from "../helmsman-context/heuristics.js";

export interface WorkflowSafetyPrompt {
	kind: "protected-path" | "file-delete" | "destructive-bash" | "destructive-git";
	title: string;
	message: string;
	reason: string;
}

export interface WorkflowBashSafetyOptions {
	mode?: WorkflowMode;
	targetFiles?: string[];
}

function normalizeRepoPath(path: string): string {
	return path.trim().replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\//, "");
}

const PROTECTED_PATH_PATTERNS = [/(?:^|\/|\\)\.git(?:$|\/|\\)/i, /(?:^|\/|\\)node_modules(?:$|\/|\\)/i, /(?:^|\/|\\)\.beads(?:$|\/|\\)/i, /(?:^|\/|\\)\.env(?:\.|$)/i];
const FILE_DELETE_PATTERNS = [/\brm\s+(-[A-Za-z]*[fr]|-[A-Za-z]*[r]|--recursive|--force)\b/i, /\bgit\s+rm\b/i];
const DESTRUCTIVE_GIT_PATTERNS = [
	/\bgit\s+reset\s+--hard\b/i,
	/\bgit\s+clean\b[^\n]*\s-[^\n]*f/i,
	/\bgit\s+checkout\s+--\b/i,
	/\bgit\s+restore\b[^\n]*\s--source\b/i,
	/\bgit\s+push\b[^\n]*\s--force(?:-with-lease)?\b/i,
];
const DESTRUCTIVE_BASH_PATTERNS = [
	/\bsudo\b/i,
	/\bchmod\b[^\n]*\b777\b/i,
	/\bchown\b/i,
	/\bdd\b/i,
	/\bmkfs(?:\.[A-Za-z0-9_-]+)?\b/i,
	/\btruncate\b/i,
	/\bmv\b/i,
];

interface SimpleMoveOperation {
	source: string;
	target: string;
}

function tokenizeCommand(command: string): string[] {
	return command
		.trim()
		.split(/\s+/)
		.map((part) => part.trim())
		.filter(Boolean);
}

function parseSimpleMoveOperation(command: string): SimpleMoveOperation | undefined {
	const tokens = tokenizeCommand(command);
	if (tokens.length !== 3 || tokens[0] !== "mv") return undefined;
	const [, source, target] = tokens;
	if (!source || !target) return undefined;
	if (source.startsWith("-") || target.startsWith("-")) return undefined;
	return { source, target };
}

export function isProtectedPath(path: string): boolean {
	const normalized = path.trim().replace(/\\/g, "/");
	if (!normalized) return false;
	return PROTECTED_PATH_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function getProtectedPathPrompt(path: string): WorkflowSafetyPrompt | undefined {
	if (!isProtectedPath(path)) return undefined;
	return {
		kind: "protected-path",
		title: "Confirm protected-path change",
		message: `Helmsman flagged this as a protected path:\n\n${path}\n\nOnly continue if you intentionally want to modify sensitive repo or tracker state.`,
		reason: `Protected path confirmation required for ${path}.`,
	};
}

export function isPathCoveredByTargets(path: string, targetFiles: string[]): boolean {
	const normalizedPath = normalizeRepoPath(path);
	if (!normalizedPath) return true;
	if (targetFiles.length === 0) return true;

	return targetFiles
		.map((target) => normalizeRepoPath(target))
		.filter(Boolean)
		.some((target) => normalizedPath === target || normalizedPath.endsWith(`/${target}`) || target.endsWith(`/${normalizedPath}`));
}

function isLowRiskBuildMove(command: string, options?: WorkflowBashSafetyOptions): boolean {
	if (options?.mode !== "build") return false;
	const move = parseSimpleMoveOperation(command);
	if (!move) return false;
	if (isProtectedPath(move.source) || isProtectedPath(move.target)) return false;
	const targetFiles = options?.targetFiles ?? [];
	if (targetFiles.length === 0) return false;
	return isPathCoveredByTargets(move.source, targetFiles) && isPathCoveredByTargets(move.target, targetFiles);
}

export function getBashSafetyPrompt(command: string, options?: WorkflowBashSafetyOptions): WorkflowSafetyPrompt | undefined {
	const trimmed = command.trim();
	if (!trimmed) return undefined;
	if (FILE_DELETE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
		return {
			kind: "file-delete",
			title: "Confirm file deletion",
			message: `Helmsman detected a delete-oriented shell command:\n\n${trimmed}\n\nOnly continue if removing files is explicitly intended.`,
			reason: "File deletion confirmation required.",
		};
	}
	if (DESTRUCTIVE_GIT_PATTERNS.some((pattern) => pattern.test(trimmed))) {
		return {
			kind: "destructive-git",
			title: "Confirm destructive git command",
			message: `Helmsman detected a potentially destructive git operation:\n\n${trimmed}\n\nOnly continue if rewriting or discarding git state is explicitly intended.`,
			reason: "Destructive git confirmation required.",
		};
	}
	if (DESTRUCTIVE_BASH_PATTERNS.some((pattern) => pattern.test(trimmed))) {
		if (isLowRiskBuildMove(trimmed, options)) return undefined;
		return {
			kind: "destructive-bash",
			title: "Confirm destructive bash command",
			message: `Helmsman detected a potentially destructive shell command:\n\n${trimmed}\n\nOnly continue if this mutation is intentional and scoped.`,
			reason: "Destructive bash confirmation required.",
		};
	}
	return undefined;
}

export function getPlanModeBashBlockReason(command: string): string | undefined {
	if (isReadOnlyBashCommand(command)) return undefined;
	return "Plan mode stays read-only so we can keep assumptions and scope visible. Switch to /mode build and use an approved plan before running mutating shell commands.";
}

export function getUnexpectedFileSpreadReason(path: string, targetFiles: string[]): string | undefined {
	if (isPathCoveredByTargets(path, targetFiles)) return undefined;
	return `Planned target files were ${targetFiles.join(", ")}, but execution attempted to touch ${path}. I’m returning to plan mode so we can confirm whether that broader scope is intentional.`;
}
