import type { VoiceProvider } from "../smart-voice-notify/config.js";
import { resolveVoiceNotifyConfig } from "../smart-voice-notify/config.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { detectAvailableVoiceProviders, findExecutableInPath, resolveVoiceProvider } from "../smart-voice-notify/providers.js";
import { getVoiceNotifyError, getVoiceNotifyStatus, playAudioFile, sanitizeVoiceMessage, speakVoiceMessage, type VoiceNotifyStatus, type VoiceSpawn } from "../smart-voice-notify/runtime.js";

export type WorkflowTtsBackend = VoiceProvider;
export type WorkflowTtsMilestone = "plan-ready" | "approval-required" | "phase-complete" | "run-complete" | "safety-block";

export const WORKFLOW_TTS_MILESTONES: WorkflowTtsMilestone[] = [
	"plan-ready",
	"approval-required",
	"phase-complete",
	"run-complete",
	"safety-block",
];

export interface WorkflowTtsResult {
	backend?: WorkflowTtsBackend;
	status: VoiceNotifyStatus;
	error?: string;
	mode: "tts" | "clip";
	clipPath?: string;
}

export interface WorkflowTtsRuntimeStatus {
	backend?: WorkflowTtsBackend;
	clipDir?: string;
	configuredClips: WorkflowTtsMilestone[];
	missingClips: WorkflowTtsMilestone[];
}

export function detectWorkflowTtsBackend(pathEnv = process.env.PATH ?? ""): WorkflowTtsBackend | undefined {
	return resolveVoiceProvider(detectAvailableVoiceProviders(pathEnv), undefined, process.platform);
}

const WORKFLOW_TTS_CLIP_DIR_ENV = "HELMSMAN_TTS_CLIP_DIR";

export { findExecutableInPath, sanitizeVoiceMessage as sanitizeWorkflowTtsMessage };

export function resolveWorkflowMilestoneClipPath(
	milestone: WorkflowTtsMilestone,
	env = process.env,
): string | undefined {
	const clipDir = env[WORKFLOW_TTS_CLIP_DIR_ENV]?.trim();
	if (!clipDir) return undefined;
	const candidate = join(clipDir, `${milestone}.wav`);
	return existsSync(candidate) ? candidate : undefined;
}

export function getWorkflowTtsRuntimeStatus(
	options?: { env?: NodeJS.ProcessEnv; pathEnv?: string },
): WorkflowTtsRuntimeStatus {
	const env = options?.env ?? process.env;
	const clipDir = env[WORKFLOW_TTS_CLIP_DIR_ENV]?.trim() || undefined;
	const configuredClips = WORKFLOW_TTS_MILESTONES.filter((milestone) => Boolean(resolveWorkflowMilestoneClipPath(milestone, env)));
	const missingClips = clipDir
		? WORKFLOW_TTS_MILESTONES.filter((milestone) => !configuredClips.includes(milestone))
		: [];
	return {
		backend: detectWorkflowTtsBackend(options?.pathEnv ?? process.env.PATH ?? ""),
		clipDir,
		configuredClips,
		missingClips,
	};
}

export function formatWorkflowTtsRuntimeStatus(status: WorkflowTtsRuntimeStatus): string {
	return [
		`Voice backend: ${status.backend ?? "none"}`,
		`Clip dir: ${status.clipDir ?? "not configured"}`,
		`Configured milestone clips: ${status.configuredClips.join(", ") || "none"}`,
		...(status.clipDir ? [`Missing milestone clips: ${status.missingClips.join(", ") || "none"}`] : []),
	].join("\n");
}

export function buildWorkflowTtsMessage(milestone: WorkflowTtsMilestone): string {
	switch (milestone) {
		case "plan-ready":
			return "Plan ready.";
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

export function getWorkflowTtsArgs(backend: WorkflowTtsBackend, message: string): string[] {
	const sanitized = sanitizeVoiceMessage(message, resolveVoiceNotifyConfig().maxChars);
	return [sanitized];
}

export function speakWorkflowMilestone(
	milestone: WorkflowTtsMilestone,
	backend = detectWorkflowTtsBackend(),
	options?: { env?: NodeJS.ProcessEnv; pathEnv?: string; spawnImpl?: VoiceSpawn },
): WorkflowTtsResult {
	const clipPath = resolveWorkflowMilestoneClipPath(milestone, options?.env ?? process.env);
	if (clipPath) {
		const playedClip = playAudioFile(clipPath, { pathEnv: options?.pathEnv, spawnImpl: options?.spawnImpl });
		if (playedClip.played) {
			const config = resolveVoiceNotifyConfig();
			const status = backend
				? getVoiceNotifyStatus({ ...config, preferredProvider: backend }, options?.pathEnv)
				: getVoiceNotifyStatus(config, options?.pathEnv);
			return {
				backend,
				status: { ...status, ready: true, broken: false, reason: `played clip via ${playedClip.command}` },
				error: undefined,
				mode: "clip",
				clipPath,
			};
		}
	}
	const message = buildWorkflowTtsMessage(milestone);
	const config = resolveVoiceNotifyConfig();
	const status = backend
		? speakVoiceMessage(message, { ...config, preferredProvider: backend }, { pathEnv: options?.pathEnv, spawnImpl: options?.spawnImpl })
		: speakVoiceMessage(message, config, { pathEnv: options?.pathEnv, spawnImpl: options?.spawnImpl });
	return {
		backend,
		status,
		error: getVoiceNotifyError(status),
		mode: "tts",
		clipPath,
	};
}
