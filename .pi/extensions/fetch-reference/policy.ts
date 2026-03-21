import { ALLOWED_HOSTS, ALLOWED_REPOSITORIES } from "./config.js";
import type { NormalizedReference } from "./types.js";

function assertAllowedRepository(owner: string, repo: string, originalUrl: string): void {
	const repository = `${owner}/${repo}`;
	if (!ALLOWED_REPOSITORIES.has(repository)) {
		throw new Error(
			`Repository not allowlisted for constrained reference fetch: ${repository}. URL: ${originalUrl}. Allowed repositories: ${Array.from(ALLOWED_REPOSITORIES).join(", ")}`,
		);
	}
}

function normalizeGithubBlobUrl(parsed: URL, input: string): NormalizedReference {
	const parts = parsed.pathname.split("/").filter(Boolean);
	if (parts.length < 5 || parts[2] !== "blob") {
		throw new Error(`Only GitHub blob references are supported for github.com URLs. URL: ${input}`);
	}

	const [owner, repo, _blob, ref, ...rest] = parts;
	assertAllowedRepository(owner, repo, input);
	return {
		normalizedUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${rest.join("/")}`,
		normalization: ["github blob URL normalized to raw.githubusercontent.com"],
		sourceKind: "github-blob",
	};
}

function normalizeGithubRawUrl(parsed: URL, input: string): NormalizedReference {
	const parts = parsed.pathname.split("/").filter(Boolean);
	if (parts.length < 4) {
		throw new Error(`raw.githubusercontent.com URL must include owner/repo/ref/path: ${input}`);
	}

	const [owner, repo] = parts;
	assertAllowedRepository(owner, repo, input);
	return {
		normalizedUrl: parsed.toString(),
		normalization: [],
		sourceKind: "github-raw",
	};
}

export function normalizeReferenceUrl(input: string): NormalizedReference {
	let parsed: URL;
	try {
		parsed = new URL(input);
	} catch {
		throw new Error(`Invalid URL: ${input}`);
	}

	if (parsed.protocol !== "https:") {
		throw new Error(`Only HTTPS references are allowed: ${input}`);
	}

	if (!ALLOWED_HOSTS.has(parsed.hostname)) {
		throw new Error(
			`Host not allowlisted for constrained reference fetch: ${parsed.hostname}. Allowed hosts: ${Array.from(ALLOWED_HOSTS).join(", ")}`,
		);
	}

	if (parsed.hostname === "github.com") {
		return normalizeGithubBlobUrl(parsed, input);
	}

	if (parsed.hostname === "raw.githubusercontent.com") {
		return normalizeGithubRawUrl(parsed, input);
	}

	throw new Error(`Normalized URL is not on an allowlisted raw host: ${parsed.toString()}`);
}

export function ensureTextLikeContentType(contentType: string): void {
	const normalized = contentType.toLowerCase();
	const allowedPrefixes = [
		"text/",
		"application/json",
		"application/javascript",
		"application/typescript",
		"application/x-typescript",
		"application/xml",
		"application/yaml",
		"application/x-yaml",
	];

	if (!allowedPrefixes.some((prefix) => normalized.startsWith(prefix))) {
		throw new Error(`Fetched content type is not allowed for text-only spike: ${contentType}`);
	}
}
