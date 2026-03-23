import { spawn } from "node:child_process";
import { preferRtkCommand } from "./policy";

const IMAGE_PATH_PATTERN = /\.(?:png|jpe?g|gif|webp)$/i;
const DEFAULT_TIMEOUT_SECONDS = 10;

export interface ReadToolParams {
	path: string;
	offset?: number;
	limit?: number;
}

export interface GrepToolParams {
	pattern: string;
	path?: string;
	glob?: string;
	ignoreCase?: boolean;
	literal?: boolean;
	context?: number;
	limit?: number;
}

export interface FindToolParams {
	pattern: string;
	path?: string;
	limit?: number;
}

export interface LsToolParams {
	path?: string;
	limit?: number;
}

export interface RtkToolExecutionOptions {
	cwd: string;
	signal?: AbortSignal;
	env?: NodeJS.ProcessEnv;
	timeoutSeconds?: number;
}

export interface RtkToolExecutionResult {
	output: string;
	command: string;
	exitCode: number | null;
}

function shellQuote(value: string): string {
	return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function isSimpleFindPattern(pattern: string): boolean {
	return Boolean(pattern.trim()) && !pattern.includes("/") && !pattern.includes("**");
}

export function buildRtkReadToolCommand(params: ReadToolParams): string | undefined {
	if (!params.path?.trim()) return undefined;
	if (IMAGE_PATH_PATTERN.test(params.path)) return undefined;
	if (params.offset !== undefined && params.offset > 1) return undefined;
	const parts = ["rtk", "read", shellQuote(params.path)];
	if (params.limit !== undefined) parts.push("--max-lines", String(params.limit));
	return parts.join(" ");
}

export function buildRtkGrepToolCommand(params: GrepToolParams): string | undefined {
	if (!params.pattern?.trim()) return undefined;
	const parts = ["rtk", "grep", shellQuote(params.pattern), shellQuote(params.path?.trim() || ".")];
	if (params.ignoreCase) parts.push("-i");
	if (params.literal) parts.push("-F");
	if (params.context !== undefined) parts.push("-C", String(params.context));
	if (params.glob?.trim()) parts.push("--glob", shellQuote(params.glob.trim()));
	if (params.limit !== undefined) parts.push("-m", String(params.limit));
	return parts.join(" ");
}

export function buildRtkFindToolCommand(params: FindToolParams): string | undefined {
	if (!isSimpleFindPattern(params.pattern)) return undefined;
	if (params.limit !== undefined) return undefined;
	return ["rtk", "find", shellQuote(params.path?.trim() || "."), "-name", shellQuote(params.pattern.trim())].join(" ");
}

export function buildRtkLsToolCommand(params: LsToolParams): string | undefined {
	if (params.limit !== undefined) return undefined;
	return ["rtk", "ls", shellQuote(params.path?.trim() || ".")].join(" ");
}

export async function executeRtkToolCommand(command: string, options: RtkToolExecutionOptions): Promise<RtkToolExecutionResult | undefined> {
	return await new Promise((resolve) => {
		const child = spawn("bash", ["-lc", command], {
			cwd: options.cwd,
			env: options.env,
			stdio: ["ignore", "pipe", "pipe"],
		});
		const chunks: Buffer[] = [];
		const timeout = setTimeout(() => child.kill("SIGTERM"), (options.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000);
		const abort = () => child.kill("SIGTERM");
		options.signal?.addEventListener("abort", abort, { once: true });
		child.stdout.on("data", (data: Buffer) => chunks.push(data));
		child.stderr.on("data", (data: Buffer) => chunks.push(data));
		child.on("close", (exitCode) => {
			clearTimeout(timeout);
			options.signal?.removeEventListener("abort", abort);
			if (exitCode !== 0) return resolve(undefined);
			resolve({
				output: Buffer.concat(chunks).toString("utf8").trimEnd(),
				command,
				exitCode,
			});
		});
		child.on("error", () => {
			clearTimeout(timeout);
			options.signal?.removeEventListener("abort", abort);
			resolve(undefined);
		});
	});
}

export function preferRtkReadOnlyCommands(commands: string[]): string[] {
	return commands.map((command) => preferRtkCommand(command));
}
