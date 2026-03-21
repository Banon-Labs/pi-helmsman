export interface HelmsmanContextStateEntry {
	type: string;
	customType?: string;
	data?: { lastGoalText?: string };
}

export function restoreTrackedGoal(entries: HelmsmanContextStateEntry[]): string {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.type !== "custom") continue;
		if (entry.customType !== "helmsman-context-state") continue;
		const lastGoalText = entry.data?.lastGoalText?.trim();
		if (lastGoalText) return lastGoalText;
	}
	return "";
}
