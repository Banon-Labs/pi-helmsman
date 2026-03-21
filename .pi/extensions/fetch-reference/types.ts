export interface MaterializedReference {
	originalUrl: string;
	normalizedUrl: string;
	sourceKind: "github-blob" | "github-raw";
	cacheKey: string;
	bodyPath: string;
	relativeBodyPath: string;
	provenancePath: string;
	relativeProvenancePath: string;
	contentType: string;
	byteLength: number;
	sha256: string;
	fetchedAt: string;
	normalization: string[];
	policyVersion: number;
}

export interface NormalizedReference {
	normalizedUrl: string;
	normalization: string[];
	sourceKind: "github-blob" | "github-raw";
}
