export interface MaterializedWebContent {
	originalUrl: string;
	normalizedUrl: string;
	sourceKind: "direct-https";
	cacheKey: string;
	bodyPath: string;
	relativeBodyPath: string;
	provenancePath: string;
	relativeProvenancePath: string;
	contentType: string;
	byteLength: number;
	sha256: string;
	fetchedAt: string;
	policyVersion: number;
	title?: string;
	previewText: string;
}

export interface NormalizedWebReference {
	normalizedUrl: string;
	sourceKind: "direct-https";
}
