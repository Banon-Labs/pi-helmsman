export type ForcedChoiceResult = { kind: "first" | "second" } | { kind: "other"; text: string } | { kind: "other-empty" };

export function resolveForcedChoiceSelection(
	selected: string | undefined,
	choices: readonly [string, string, string],
	otherText?: string,
): ForcedChoiceResult | undefined {
	if (!selected) return undefined;
	if (selected === choices[2]) {
		const text = otherText?.trim() ?? "";
		return text ? { kind: "other", text } : { kind: "other-empty" };
	}
	if (selected === choices[0]) return { kind: "first" };
	if (selected === choices[1]) return { kind: "second" };
	return undefined;
}
