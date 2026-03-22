import type { CupcakeBridgeConfig } from "./config.js";
import type { CupcakePolicyEvent } from "./events.js";

export interface CupcakeDecision {
	decision?: string;
	reason?: string;
	question?: string;
	context?: string[];
	[key: string]: unknown;
}

interface CupcakeInstance {
	init?(path?: string, harness?: string): Promise<void> | void;
	evaluate(event: CupcakePolicyEvent): Promise<CupcakeDecision> | CupcakeDecision;
	isReady?: boolean | (() => boolean);
}

interface CupcakeModuleShape {
	Cupcake?: new () => CupcakeInstance;
	init?: (path?: string, harness?: string) => Promise<void> | void;
	evaluate?: (event: CupcakePolicyEvent) => Promise<CupcakeDecision> | CupcakeDecision;
	isReady?: boolean | (() => boolean);
}

export interface CupcakeRuntime {
	ready: boolean;
	description: string;
	evaluate(event: CupcakePolicyEvent): Promise<CupcakeDecision | undefined>;
}

export interface CupcakeEnforcement {
	allow: boolean;
	reason?: string;
	severity: "info" | "warning";
}

export async function loadCupcakeRuntime(
	config: CupcakeBridgeConfig,
	importModule: (moduleId: string) => Promise<CupcakeModuleShape> = (moduleId) => import(moduleId),
): Promise<CupcakeRuntime> {
	if (!config.enabled) {
		return {
			ready: false,
			description: "disabled",
			async evaluate() {
				return undefined;
			},
		};
	}

	try {
		const mod = await importModule(config.moduleId);
		const evaluator = await initializeEvaluator(mod, config);
		return {
			ready: readReadyFlag(evaluator),
			description: `ready via ${config.moduleId}`,
			async evaluate(event) {
				return await evaluator.evaluate(event);
			},
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			ready: false,
			description: `unavailable: ${message}`,
			async evaluate() {
				return undefined;
			},
		};
	}
}

async function initializeEvaluator(mod: CupcakeModuleShape, config: CupcakeBridgeConfig): Promise<CupcakeInstance> {
	if (mod.Cupcake) {
		const instance = new mod.Cupcake();
		if (instance.init) {
			await instance.init(config.policyDir, config.harness);
		}
		return instance;
	}

	if (mod.init && mod.evaluate) {
		await mod.init(config.policyDir, config.harness);
		return {
			evaluate: mod.evaluate,
			isReady: mod.isReady,
		};
	}

	throw new Error("Configured Cupcake module does not expose a compatible Cupcake API");
}

function readReadyFlag(evaluator: CupcakeInstance): boolean {
	if (typeof evaluator.isReady === "function") return evaluator.isReady();
	if (typeof evaluator.isReady === "boolean") return evaluator.isReady;
	return true;
}

export function enforceCupcakeDecision(
	decision: CupcakeDecision | undefined,
	failMode: CupcakeBridgeConfig["failMode"],
	fallbackReason?: string,
): CupcakeEnforcement {
	if (!decision) {
		if (failMode === "closed") {
			return {
				allow: false,
				reason: fallbackReason ?? "Cupcake policy evaluation was unavailable.",
				severity: "warning",
			};
		}
		return {
			allow: true,
			severity: "warning",
			reason: fallbackReason,
		};
	}

	const normalized = String(decision.decision ?? "Allow").toLowerCase();
	if (normalized === "allow") {
		return {
			allow: true,
			severity: "info",
			reason: decision.context?.join(" ") || decision.reason,
		};
	}
	if (normalized === "deny" || normalized === "halt") {
		return {
			allow: false,
			severity: "warning",
			reason: decision.reason ?? "Blocked by Cupcake policy.",
		};
	}
	if (normalized === "ask") {
		return {
			allow: false,
			severity: "warning",
			reason: decision.question ?? decision.reason ?? "Cupcake requested manual review.",
		};
		}

	return {
		allow: failMode !== "closed",
		severity: "warning",
		reason: decision.reason ?? fallbackReason ?? `Unknown Cupcake decision: ${decision.decision}`,
	};
}
