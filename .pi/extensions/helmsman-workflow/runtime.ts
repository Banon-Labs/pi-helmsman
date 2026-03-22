export function describePlannerRuntime(hasModel: boolean): string {
	return hasModel
		? "Planner runtime: ready (model selected)"
		: "Planner runtime: blocked (no model selected; draft scaffold and prompts only)";
}
