import { describe, expect, it } from 'vitest';
import {
	STEPS,
	type Step,
	canOpen,
	emptyDraft,
	firstOpenStep,
	stepsFor,
	withHabits
} from './card-draft.ts';

describe('card draft rules', () => {
	it('orders steps and finds the first open one', () => {
		expect(STEPS).toEqual(['size', 'habits', 'targets', 'rewards', 'board']);
		const draft = emptyDraft('2026-10');
		expect(stepsFor(draft)).toEqual([...STEPS]);
		expect(firstOpenStep(draft)).toBe('size');
		expect(canOpen(draft, 'size')).toBe(true);
		expect(canOpen(draft, 'habits')).toBe(false);

		const done = {
			...draft,
			completed: ['size', 'habits'] as Step[]
		};
		expect(firstOpenStep(done)).toBe('targets');
		expect(canOpen(done, 'targets')).toBe(true);
		expect(canOpen(done, 'rewards')).toBe(false);
		expect(firstOpenStep({ ...done, completed: [...STEPS] })).toBe('board');

		const editing = { ...draft, cardId: 'card-1' };
		expect(stepsFor(editing)).toEqual(['habits', 'targets', 'rewards', 'board']);
		expect(firstOpenStep(editing)).toBe('habits');
		expect(canOpen(editing, 'habits')).toBe(true);
		expect(canOpen(editing, 'targets')).toBe(false);
	});

	it('changing habits drops their overrides and the layout', () => {
		const draft = {
			...emptyDraft('2026-10'),
			habitIds: ['a', 'b', 'c'],
			targets: { a: 2, b: 3 },
			layout: ['a', 'b', 'c']
		};
		const same = withHabits(draft, ['c', 'b', 'a']);
		expect(same.layout).toEqual(['a', 'b', 'c']);
		expect(same.habitIds).toEqual(['c', 'b', 'a']);
		const changed = withHabits(draft, ['a', 'c', 'd']);
		expect(changed.targets).toEqual({ a: 2 });
		expect(changed.layout).toBeNull();
		expect(changed.habitIds).toEqual(['a', 'c', 'd']);
	});
});
