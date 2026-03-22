import { describe, expect, test } from "bun:test";
import {
	buildContextDirectBashBlockOutput,
	buildContextGuardMessage,
	buildContextMutationBlockReason,
	buildContextRouteNotice,
	buildContextSwitchUnavailableNotice,
} from "./messages";
import type { ContextAssessment } from "./types";

function buildAssessment(): ContextAssessment {
	return {
		state: "uncertain",
		workspaceRoot: "/workspace",
		currentRepoRoot: "/workspace/current",
		currentRepoCandidate: undefined,
		selectedRepo: undefined,
		decisionExplanation: undefined,
		suggestedFolder: undefined,
		suggestedFolderSource: undefined,
		suggestedFolderBasis: undefined,
		blockMutations: true,
		summary: "Context uncertain: repo suitability is unresolved",
		candidates: [],
	};
}

describe("helmsman context messaging", () => {
	test("guard message points toward read-only inspection and explicit switching", () => {
		const message = buildContextGuardMessage(buildAssessment());
		expect(message).toContain("Hold off on mutations");
		expect(message).toContain("/context");
		expect(message).toContain("/context-switch");
	});

	test("mutation block reason sounds collaborative and gives next actions", () => {
		expect(buildContextMutationBlockReason("Context uncertain", "context")).toContain("I’m blocking mutation");
		expect(buildContextMutationBlockReason("Context uncertain", "context")).toContain("read-only mode");
	});

	test("direct bash block output explains the temporary restriction", () => {
		expect(buildContextDirectBashBlockOutput("Context mismatch", "context")).toContain(
			"I’m blocking direct bash mutation",
		);
	});

	test("route/unavailable notices stay explicit without sounding scolding", () => {
		expect(buildContextSwitchUnavailableNotice()).toContain("couldn’t identify a confident target repo yet");
		expect(buildContextRouteNotice("/workspace/target")).toContain("Prepared a context-correction route");
	});
});
