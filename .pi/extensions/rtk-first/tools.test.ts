import { describe, expect, test } from "bun:test";
import {
	buildRtkFindToolCommand,
	buildRtkGrepToolCommand,
	buildRtkLsToolCommand,
	buildRtkReadToolCommand,
	preferRtkReadOnlyCommands,
} from "./tools";

describe("buildRtkReadToolCommand", () => {
	test("maps simple text reads to rtk read", () => {
		expect(buildRtkReadToolCommand({ path: "package.json" })).toBe("rtk read 'package.json'");
		expect(buildRtkReadToolCommand({ path: "package.json", limit: 40 })).toBe("rtk read 'package.json' --max-lines 40");
	});

	test("falls back for unsupported read shapes", () => {
		expect(buildRtkReadToolCommand({ path: "package.json", offset: 20 })).toBeUndefined();
		expect(buildRtkReadToolCommand({ path: "diagram.png" })).toBeUndefined();
	});
});

describe("buildRtkGrepToolCommand", () => {
	test("maps grep parameters to rtk grep", () => {
		expect(
			buildRtkGrepToolCommand({
				pattern: "helmsman",
				path: ".",
				glob: "*.ts",
				ignoreCase: true,
				literal: true,
				context: 2,
				limit: 10,
			}),
		).toBe("rtk grep 'helmsman' '.' -i -F -C 2 --glob '*.ts' -m 10");
	});
});

describe("buildRtkFindToolCommand", () => {
	test("maps simple basename globs to rtk find", () => {
		expect(buildRtkFindToolCommand({ pattern: "*.ts", path: ".pi/extensions" })).toBe(
			"rtk find '.pi/extensions' -name '*.ts'",
		);
	});

	test("falls back for complex or limited find requests", () => {
		expect(buildRtkFindToolCommand({ pattern: "**/*.ts", path: "." })).toBeUndefined();
		expect(buildRtkFindToolCommand({ pattern: "*.ts", path: ".", limit: 20 })).toBeUndefined();
	});
});

describe("buildRtkLsToolCommand", () => {
	test("maps simple directory listings to rtk ls", () => {
		expect(buildRtkLsToolCommand({ path: ".pi/extensions" })).toBe("rtk ls '.pi/extensions'");
	});

	test("falls back when ls-specific limiting is requested", () => {
		expect(buildRtkLsToolCommand({ path: ".", limit: 20 })).toBeUndefined();
	});
});

describe("preferRtkReadOnlyCommands", () => {
	test("centralizes generic read-only command normalization", () => {
		expect(preferRtkReadOnlyCommands([
			"git status --short --branch",
			"cat package.json",
			"git stash list --format='%gd %s'",
		])).toEqual([
			"rtk git status --short --branch",
			"rtk read package.json",
			"rtk git stash list --format='%gd %s'",
		]);
	});
});
