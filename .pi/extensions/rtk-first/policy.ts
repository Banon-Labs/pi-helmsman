export interface RtkRewrite {
	originalCommand: string;
	rewrittenCommand: string;
	kind: "read" | "git" | "find" | "grep" | "ls";
}

const SHELL_META_TOKENS = ["&&", "||", ";", "|", ">", "<"];
const GIT_SUBCOMMANDS = new Set(["status", "diff", "log", "show", "branch"]);

function hasShellMetacharacters(command: string): boolean {
	return SHELL_META_TOKENS.some((token) => command.includes(token));
}

function tokenizeCommand(command: string): string[] {
	return command
		.trim()
		.split(/\s+/)
		.map((part) => part.trim())
		.filter(Boolean);
}

export function getRtkEquivalent(command: string): RtkRewrite | undefined {
	const trimmed = command.trim();
	if (!trimmed || hasShellMetacharacters(trimmed)) return undefined;

	const tokens = tokenizeCommand(trimmed);
	if (tokens.length === 0) return undefined;

	if (tokens[0] === "cat" && tokens.length === 2 && !tokens[1]?.startsWith("-")) {
		return {
			originalCommand: trimmed,
			rewrittenCommand: `rtk read ${tokens[1]}`,
			kind: "read",
		};
	}

	if (tokens[0] === "git" && tokens[1] && GIT_SUBCOMMANDS.has(tokens[1])) {
		return {
			originalCommand: trimmed,
			rewrittenCommand: `rtk ${trimmed}`,
			kind: "git",
		};
	}

	if (tokens[0] === "find") {
		return {
			originalCommand: trimmed,
			rewrittenCommand: `rtk ${trimmed}`,
			kind: "find",
		};
	}

	if (tokens[0] === "grep") {
		return {
			originalCommand: trimmed,
			rewrittenCommand: `rtk ${trimmed}`,
			kind: "grep",
		};
	}

	if (tokens[0] === "ls") {
		return {
			originalCommand: trimmed,
			rewrittenCommand: `rtk ${trimmed}`,
			kind: "ls",
		};
	}

	return undefined;
}

export function looksLikeBareInspectionPrompt(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed) return false;
	if (trimmed.startsWith("/") || trimmed.startsWith("!")) return false;
	return Boolean(getRtkEquivalent(trimmed));
}

export function buildRtkInputRewriteText(rewrite: RtkRewrite): string {
	return `Use the RTK wrapper equivalent for this read-only inspection request: ${rewrite.rewrittenCommand}`;
}

export function buildRtkToolBlockReason(rewrite: RtkRewrite): string {
	return `Use the RTK wrapper equivalent for read-only inspection instead of native bash. Retry with: ${rewrite.rewrittenCommand}`;
}

export function buildRtkUserBashNotice(rewrite: RtkRewrite): string {
	return `RTK rewrite: ${rewrite.originalCommand} -> ${rewrite.rewrittenCommand}`;
}
