export function shouldTrackAsGoal(text: string): boolean {
	const trimmed = text.trim();
	return trimmed.length > 0 && !trimmed.startsWith("/");
}

export function chooseRouteGoal(commandArgs: string, lastGoalText: string, lastInputText: string): string {
	const explicitArgs = commandArgs.trim();
	if (explicitArgs) return explicitArgs;
	const trackedGoal = lastGoalText.trim();
	if (trackedGoal) return trackedGoal;
	const lastInput = lastInputText.trim();
	if (lastInput) return lastInput;
	return "continue previous task";
}
