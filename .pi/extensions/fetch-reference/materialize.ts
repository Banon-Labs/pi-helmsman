import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { ALLOWED_HOSTS, ALLOWED_REPOSITORIES, CACHE_ROOT, FETCH_TIMEOUT_MS, MAX_BYTES, POLICY_VERSION } from "./config.js";
import { ensureTextLikeContentType, normalizeReferenceUrl } from "./policy.js";
import type { MaterializedReference } from "./types.js";

function deriveFileName(referenceUrl: string, cacheKey: string): string {
	const parsed = new URL(referenceUrl);
	const rawName = basename(parsed.pathname) || "reference.txt";
	const safeBase = rawName.replace(/[^a-zA-Z0-9._-]/g, "-") || "reference.txt";
	const extension = extname(safeBase) || ".txt";
	const stem = safeBase.slice(0, safeBase.length - extension.length) || "reference";
	return `${stem}-${cacheKey.slice(0, 12)}${extension}`;
}

function createFetchController(signal?: AbortSignal): { controller: AbortController; cleanup: () => void } {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(new Error(`Fetch timed out after ${FETCH_TIMEOUT_MS}ms`)), FETCH_TIMEOUT_MS);
	const abortFromCaller = () => controller.abort(new Error("Fetch aborted"));
	signal?.addEventListener("abort", abortFromCaller, { once: true });
	return {
		controller,
		cleanup: () => {
			clearTimeout(timeout);
			signal?.removeEventListener("abort", abortFromCaller);
		},
	};
}

function assertDeclaredLength(declaredLength: string | null): void {
	if (!declaredLength) return;
	const parsedLength = Number.parseInt(declaredLength, 10);
	if (Number.isFinite(parsedLength) && parsedLength > MAX_BYTES) {
		throw new Error(`Remote content length ${parsedLength} exceeds ${MAX_BYTES} byte limit`);
	}
}

function buildReferencePaths(cwd: string, normalizedUrl: string) {
	const cacheKey = createHash("sha256").update(normalizedUrl).digest("hex");
	const dir = join(cwd, CACHE_ROOT, cacheKey.slice(0, 2), cacheKey);
	const fileName = deriveFileName(normalizedUrl, cacheKey);
	return {
		cacheKey,
		dir,
		bodyPath: join(dir, fileName),
		relativeBodyPath: join(CACHE_ROOT, cacheKey.slice(0, 2), cacheKey, fileName),
		provenancePath: join(dir, `${fileName}.provenance.json`),
		relativeProvenancePath: join(CACHE_ROOT, cacheKey.slice(0, 2), cacheKey, `${fileName}.provenance.json`),
	};
}

function buildProvenance(reference: MaterializedReference) {
	return {
		version: 1,
		policyVersion: reference.policyVersion,
		originalUrl: reference.originalUrl,
		normalizedUrl: reference.normalizedUrl,
		sourceKind: reference.sourceKind,
		fetchedAt: reference.fetchedAt,
		contentType: reference.contentType,
		byteLength: reference.byteLength,
		sha256: reference.sha256,
		cacheKey: reference.cacheKey,
		bodyPath: reference.bodyPath,
		relativeBodyPath: reference.relativeBodyPath,
		provenancePath: reference.provenancePath,
		relativeProvenancePath: reference.relativeProvenancePath,
		normalization: reference.normalization,
		constraints: {
			maxBytes: MAX_BYTES,
			fetchTimeoutMs: FETCH_TIMEOUT_MS,
			allowedHosts: Array.from(ALLOWED_HOSTS),
			allowedRepositories: Array.from(ALLOWED_REPOSITORIES),
			mode: "text-only-github-policy",
		},
	};
}

export async function materializeReference(url: string, cwd: string, signal?: AbortSignal): Promise<MaterializedReference> {
	const { normalizedUrl, normalization, sourceKind } = normalizeReferenceUrl(url);
	const paths = buildReferencePaths(cwd, normalizedUrl);
	await mkdir(paths.dir, { recursive: true });

	const { controller, cleanup } = createFetchController(signal);
	try {
		const response = await fetch(normalizedUrl, {
			signal: controller.signal,
			headers: {
				"User-Agent": "pi-helmsman-fetch-reference/0.1",
				Accept: "text/plain, text/markdown, text/*, application/json;q=0.9, */*;q=0.1",
			},
		});
		if (!response.ok) {
			throw new Error(`Fetch failed with ${response.status} ${response.statusText}`);
		}

		assertDeclaredLength(response.headers.get("content-length"));
		const contentType = response.headers.get("content-type") ?? "text/plain";
		ensureTextLikeContentType(contentType);

		const buffer = Buffer.from(await response.arrayBuffer());
		if (buffer.byteLength > MAX_BYTES) {
			throw new Error(`Fetched content exceeds ${MAX_BYTES} byte limit after download (${buffer.byteLength} bytes)`);
		}

		const reference: MaterializedReference = {
			originalUrl: url,
			normalizedUrl,
			sourceKind,
			cacheKey: paths.cacheKey,
			bodyPath: paths.bodyPath,
			relativeBodyPath: paths.relativeBodyPath,
			provenancePath: paths.provenancePath,
			relativeProvenancePath: paths.relativeProvenancePath,
			contentType,
			byteLength: buffer.byteLength,
			sha256: createHash("sha256").update(buffer).digest("hex"),
			fetchedAt: new Date().toISOString(),
			normalization,
			policyVersion: POLICY_VERSION,
		};

		await writeFile(reference.bodyPath, buffer.toString("utf8"), "utf8");
		await writeFile(reference.provenancePath, `${JSON.stringify(buildProvenance(reference), null, 2)}\n`, "utf8");
		return reference;
	} finally {
		cleanup();
	}
}

export function formatSummary(reference: MaterializedReference): string {
	const normalizationLine =
		reference.normalization.length > 0
			? `Normalization: ${reference.normalization.join("; ")}`
			: "Normalization: none";

	return [
		`Fetched constrained reference: ${reference.normalizedUrl}`,
		`Source kind: ${reference.sourceKind}`,
		`Policy version: ${reference.policyVersion}`,
		`Local file: ${reference.relativeBodyPath}`,
		`Provenance: ${reference.relativeProvenancePath}`,
		`Content-Type: ${reference.contentType}`,
		`Bytes: ${reference.byteLength}`,
		`SHA-256: ${reference.sha256}`,
		normalizationLine,
	].join("\n");
}
