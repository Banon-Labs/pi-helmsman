import type { VoiceProvider } from "../smart-voice-notify/config.js";
import { resolveVoiceNotifyConfig } from "../smart-voice-notify/config.js";
import { detectAvailableVoiceProviders, findExecutableInPath, resolveVoiceProvider } from "../smart-voice-notify/providers.js";
import { sanitizeVoiceMessage, speakVoiceMessage } from "../smart-voice-notify/runtime.js";

export type WorkflowTtsBackend = VoiceProvider;
export type WorkflowTtsMilestone = "plan-ready" | "approval-required" | "phase-complete" | "run-complete" | "safety-block";

export function detectWorkflowTtsBackend(pathEnv = process.env.PATH ?? ""): WorkflowTtsBackend | undefined {
	return resolveVoiceProvider(detectAvailableVoiceProviders(pathEnv));
}

export { findExecutableInPath, sanitizeVoiceMessage as sanitizeWorkflowTtsMessage };

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

export function getWorkflowTtsArgs(backend: WorkflowTtsBackend, message: string): string[] {
	const sanitized = sanitizeVoiceMessage(message, resolveVoiceNotifyConfig().maxChars);
	return [sanitized];
}

export function speakWorkflowMilestone(
	milestone: WorkflowTtsMilestone,
	backend = detectWorkflowTtsBackend(),
): WorkflowTtsBackend | undefined {
	if (!backend) return undefined;
	const message = buildWorkflowTtsMessage(milestone);
	const config = resolveVoiceNotifyConfig();
	speakVoiceMessage(message, { ...config, preferredProvider: backend });
	return backend;
}
