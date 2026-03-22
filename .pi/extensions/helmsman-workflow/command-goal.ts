export function shouldPromptForPlanGoal(commandArgs: string, existingGoal: string): boolean {
	return !commandArgs.trim() && !existingGoal.trim();
}

export function normalizeRequestedPlanGoal(commandArgs: string, existingGoal: string): string {
	return commandArgs.trim() || existingGoal.trim();
}
