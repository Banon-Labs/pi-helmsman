import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import type { VoiceProvider } from "./config.js";

export const VOICE_PROVIDER_CANDIDATES: VoiceProvider[] = ["say", "espeak-ng", "spd-say"];

export function findExecutableInPath(command: string, pathEnv = process.env.PATH ?? ""): string | undefined {
	for (const dir of pathEnv.split(delimiter).filter(Boolean)) {
		const candidate = join(dir, command);
		if (existsSync(candidate)) return candidate;
	}
	return undefined;
}

export function detectAvailableVoiceProviders(pathEnv = process.env.PATH ?? ""): VoiceProvider[] {
	return VOICE_PROVIDER_CANDIDATES.filter((provider) => Boolean(findExecutableInPath(provider, pathEnv)));
}

export function resolveVoiceProvider(
	availableProviders: VoiceProvider[],
	preferredProvider?: VoiceProvider,
	platform = process.platform,
): VoiceProvider | undefined {
	if (preferredProvider && availableProviders.includes(preferredProvider)) return preferredProvider;
	const priority =
		platform === "linux"
			? (["spd-say", "espeak-ng", "say"] as const)
			: (["say", "espeak-ng", "spd-say"] as const);
	return priority.find((provider) => availableProviders.includes(provider));
}

export function buildVoiceProviderArgs(provider: VoiceProvider, message: string): string[] {
	switch (provider) {
		case "say":
			return [message];
		case "espeak-ng":
			return ["-s", "155", message];
		case "spd-say":
			return ["-r", "-20", message];
	}
}
