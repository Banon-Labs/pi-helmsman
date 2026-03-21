import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { materializeReference } from "./materialize.ts";

const tempDirs: string[] = [];
const originalFetch = globalThis.fetch;

afterEach(async () => {
	globalThis.fetch = originalFetch;
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir() {
	const dir = await mkdtemp(join(tmpdir(), "pi-helmsman-fetch-reference-"));
	tempDirs.push(dir);
	return dir;
}

describe("materializeReference", () => {
	test("writes the fetched body and provenance metadata locally", async () => {
		globalThis.fetch = async () =>
			new Response("hello from test\n", {
				status: 200,
				headers: {
					"content-type": "text/plain; charset=utf-8",
					"content-length": "16",
				},
			});

		const cwd = await createTempDir();
		const reference = await materializeReference(
			"https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md",
			cwd,
		);

		expect(reference.sourceKind).toBe("github-blob");
		expect(reference.policyVersion).toBe(2);
		expect(reference.relativeBodyPath).toContain(".pi/remote-refs/");

		const body = await readFile(reference.bodyPath, "utf8");
		expect(body).toBe("hello from test\n");

		const provenance = JSON.parse(await readFile(reference.provenancePath, "utf8"));
		expect(provenance.originalUrl).toBe(
			"https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md",
		);
		expect(provenance.normalizedUrl).toBe(
			"https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md",
		);
		expect(provenance.policyVersion).toBe(2);
		expect(provenance.sourceKind).toBe("github-blob");
		expect(provenance.constraints.allowedRepositories).toContain("badlogic/pi-mono");
	});
});
