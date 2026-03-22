export const CUPCAKE_STATUS_KEY = "cupcake-policy";
export const CUPCAKE_COMMAND_NAME = "cupcake-status";
export const CUPCAKE_CUSTOM_TYPE = "cupcake-policy";
export const CUPCAKE_ENABLED_ENV = "HELMSMAN_CUPCAKE_ENABLED";
export const CUPCAKE_MODULE_ENV = "HELMSMAN_CUPCAKE_MODULE";
export const CUPCAKE_POLICY_DIR_ENV = "HELMSMAN_CUPCAKE_POLICY_DIR";
export const CUPCAKE_HARNESS_ENV = "HELMSMAN_CUPCAKE_HARNESS";
export const CUPCAKE_FAIL_MODE_ENV = "HELMSMAN_CUPCAKE_FAIL_MODE";

export type CupcakeHarness = "claude" | "cursor";
export type CupcakeFailMode = "open" | "closed";

export interface CupcakeBridgeConfig {
	enabled: boolean;
	moduleId: string;
	policyDir: string;
	harness: CupcakeHarness;
	failMode: CupcakeFailMode;
}

function parseBoolean(value: string | undefined): boolean {
	if (!value) return false;
	const normalized = value.trim().toLowerCase();
	return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function resolveCupcakeBridgeConfig(env = process.env): CupcakeBridgeConfig {
	const harnessValue = env[CUPCAKE_HARNESS_ENV]?.trim().toLowerCase();
	const failModeValue = env[CUPCAKE_FAIL_MODE_ENV]?.trim().toLowerCase();
	return {
		enabled: parseBoolean(env[CUPCAKE_ENABLED_ENV]),
		moduleId: env[CUPCAKE_MODULE_ENV]?.trim() || "@eqtylab/cupcake",
		policyDir: env[CUPCAKE_POLICY_DIR_ENV]?.trim() || ".cupcake",
		harness: harnessValue === "cursor" ? "cursor" : "claude",
		failMode: failModeValue === "closed" ? "closed" : "open",
	};
}

export function formatCupcakeBridgeConfig(config: CupcakeBridgeConfig): string {
	return [
		`Enabled: ${config.enabled ? "yes" : "no"}`,
		`Module: ${config.moduleId}`,
		`Policy dir: ${config.policyDir}`,
		`Harness: ${config.harness}`,
		`Fail mode: ${config.failMode}`,
	].join("\n");
}
