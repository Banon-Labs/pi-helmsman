import { describe, expect, test } from "bun:test";
import {
	formatCupcakeBridgeConfig,
	resolveCupcakeBridgeConfig,
	CUPCAKE_ENABLED_ENV,
	CUPCAKE_FAIL_MODE_ENV,
	CUPCAKE_HARNESS_ENV,
	CUPCAKE_MODULE_ENV,
	CUPCAKE_POLICY_DIR_ENV,
} from "./config";

describe("resolveCupcakeBridgeConfig", () => {
	test("defaults to disabled open-mode config", () => {
		const config = resolveCupcakeBridgeConfig({});

		expect(config).toEqual({
			enabled: false,
			moduleId: "@eqtylab/cupcake",
			policyDir: ".cupcake",
			harness: "claude",
			failMode: "open",
		});
	});

	test("parses env overrides", () => {
		const config = resolveCupcakeBridgeConfig({
			[CUPCAKE_ENABLED_ENV]: "true",
			[CUPCAKE_MODULE_ENV]: "/tmp/mock-cupcake.mjs",
			[CUPCAKE_POLICY_DIR_ENV]: ".config/cupcake",
			[CUPCAKE_HARNESS_ENV]: "cursor",
			[CUPCAKE_FAIL_MODE_ENV]: "closed",
		});

		expect(config).toEqual({
			enabled: true,
			moduleId: "/tmp/mock-cupcake.mjs",
			policyDir: ".config/cupcake",
			harness: "cursor",
			failMode: "closed",
		});
	});
});

describe("formatCupcakeBridgeConfig", () => {
	test("renders a stable operator summary", () => {
		const rendered = formatCupcakeBridgeConfig({
			enabled: true,
			moduleId: "@eqtylab/cupcake",
			policyDir: ".cupcake",
			harness: "claude",
			failMode: "open",
		});

		expect(rendered).toContain("Enabled: yes");
		expect(rendered).toContain("Module: @eqtylab/cupcake");
		expect(rendered).toContain("Policy dir: .cupcake");
		expect(rendered).toContain("Harness: claude");
		expect(rendered).toContain("Fail mode: open");
	});
});
