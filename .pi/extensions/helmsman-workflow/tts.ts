import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { spawn } from "node:child_process";

export type WorkflowTtsBackend = "say" | "espeak-ng" | "spd-say";
export type WorkflowTtsMilestone = "plan-ready" | "approval-required" | "phase-complete" | "run-complete" | "safety-block";

const BACKEND_CANDIDATES: WorkflowTtsBackend[] = ["say", "espeak-ng", "spd-say"];

export function findExecutableInPath(command: string, pathEnv = process.env.PATH ?? ""): string | undefined {
	for (const dir of pathEnv.split(delimiter).filter(Boolean)) {
		const candidate = join(dir, command);
		if (existsSync(candidate)) return candidate;
	}
	return undefined;
}

export function detectWorkflowTtsBackend(pathEnv = process.env.PATH ?? ""): WorkflowTtsBackend | undefined {
	for (const command of BACKEND_CANDIDATES) {
		if (findExecutableInPath(command, pathEnv)) return command;
	}
	return undefined;
}

export function buildWorkflowTtsMessage(milestone: WorkflowTtsMilestone): string {
	switch (milestone) {
		case "plan-ready":
			return "Helmsman plan ready.";
		case "approval-required":
			return "Approval required.";
		case "phase-complete":
			return "Phase complete.";
		case "run-complete":
			return "Run complete.";
		case "safety-block":
			return "Safety block.";
	}
}

export function sanitizeWorkflowTtsMessage(message: string): string {
	return message.replace(/\s+/g, " ").trim().slice(0, 120);
}

export function getWorkflowTtsArgs(backend: WorkflowTtsBackend, message: string): string[] {
	const sanitized = sanitizeWorkflowTtsMessage(message);
	switch (backend) {
		case "say":
			return [sanitized];
		case "espeak-ng":
			return [sanitized];
		case "spd-say":
			return [sanitized];
	}
}

export function speakWorkflowMilestone(
	milestone: WorkflowTtsMilestone,
	backend = detectWorkflowTtsBackend(),
): WorkflowTtsBackend | undefined {
	if (!backend) return undefined;
	const message = buildWorkflowTtsMessage(milestone);
	const child = spawn(backend, getWorkflowTtsArgs(backend, message), {
		detached: true,
		stdio: "ignore",
	});
	child.unref();
	return backend;
}
