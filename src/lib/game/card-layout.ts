export type CardSize = 3 | 5;

export function isCardSize(value: unknown): value is CardSize {
	return value === 3 || value === 5;
}

export const CARD_SIZES: Record<
	CardSize,
	{
		habits: number;
		squares: number;
		sixtyThreshold: number;
		/** The habit-less center square (spec §3.5). */
		centerPosition: number;
	}
> = {
	3: { habits: 8, squares: 9, sixtyThreshold: 5, centerPosition: 4 },
	5: { habits: 24, squares: 25, sixtyThreshold: 12, centerPosition: 12 }
};

/** Fisher-Yates shuffle of `items`, with a null (the center square) inserted at the center. */
export function shuffleLayout<T>(
	items: readonly T[],
	size: CardSize,
	random: () => number
): (T | null)[] {
	const { habits, centerPosition } = CARD_SIZES[size];
	if (items.length !== habits) {
		throw new RangeError(`A ${size}x${size} card needs ${habits} habits, got ${items.length}.`);
	}
	const shuffled: (T | null)[] = [...items];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}
	shuffled.splice(centerPosition, 0, null);
	return shuffled;
}

/** Right length, null exactly at the center, and a permutation of `items`. */
export function isValidLayout<T>(
	layout: readonly (T | null)[],
	items: readonly T[],
	size: CardSize
): boolean {
	const { squares, centerPosition } = CARD_SIZES[size];
	if (layout.length !== squares || items.length !== CARD_SIZES[size].habits) return false;
	if (layout.some((entry, index) => (entry === null) !== (index === centerPosition))) return false;
	const remaining = [...items];
	for (const entry of layout) {
		if (entry === null) continue;
		const at = remaining.indexOf(entry);
		if (at === -1) return false;
		remaining.splice(at, 1);
	}
	return true;
}
