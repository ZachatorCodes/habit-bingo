import { describe, expect, it } from 'vitest';
import {
	STEPS,
	type Step,
	boardPreview,
	canOpen,
	complete,
	emptyDraft,
	firstOpenStep,
	keptSquares,
	nextStep,
	parseDraft,
	readTargets,
	reopen,
	startDateOf,
	startingTarget,
	stepsFor,
	targetRows,
	withHabits,
	type PickedHabit
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

const read: PickedHabit = {
	id: 'read',
	icon: 'book-open',
	name: 'Read',
	direction: 'atLeast',
	period: 'month',
	countMode: 'days',
	target: 10
};
const walk: PickedHabit = {
	id: 'walk',
	icon: 'person-simple-walk',
	name: 'Walk',
	direction: 'atLeast',
	period: 'week',
	countMode: 'days',
	target: 3
};

describe('step progress', () => {
	const draft = { ...emptyDraft('2026-10'), completed: ['size', 'habits', 'targets'] as Step[] };

	it('complete marks a step done, keeping step order', () => {
		expect(complete(emptyDraft('2026-10'), 'habits').completed).toEqual(['habits']);
		expect(complete({ ...draft, completed: ['habits'] }, 'size').completed).toEqual([
			'size',
			'habits'
		]);
	});

	it('reopen opens a step and every later one', () => {
		expect(reopen(draft, 'habits').completed).toEqual(['size']);
		expect(reopen(draft, 'size').completed).toEqual([]);
	});

	it('nextStep moves on, staying on the last step', () => {
		expect(nextStep(draft, 'size')).toBe('habits');
		expect(nextStep(draft, 'board')).toBe('board');
		expect(nextStep({ ...draft, cardId: 'c' }, 'habits')).toBe('targets');
	});
});

describe('picked habits', () => {
	const card = {
		id: 'card-1',
		startDate: '2026-10-05',
		squares: [
			{ isCenter: true as const },
			{ isCenter: false as const, habitId: null, ...walk },
			{ isCenter: false as const, habitId: 'read', ...read, id: 'square-1', target: 7 }
		]
	};

	it('keptSquares maps the edited card squares by habit id, skipping the center and gaps', () => {
		const kept = keptSquares(card);
		expect([...kept.keys()]).toEqual(['read']);
		expect(kept.get('read')).toMatchObject({ id: 'read', target: 7 });
		expect(keptSquares(null).size).toBe(0);
	});

	it('startDateOf: the edited card start, today this month, or the 1st of next month', () => {
		const editing = { ...emptyDraft('2026-10'), cardId: 'card-1' };
		expect(startDateOf('2026-10-20', card, editing)).toBe('2026-10-05');
		expect(startDateOf('2026-10-20', null, emptyDraft('2026-10'))).toBe('2026-10-20');
		expect(startDateOf('2026-10-27', null, emptyDraft('2026-11'))).toBe('2026-11-01');
		expect(startDateOf('2026-10-20', card, emptyDraft('2026-10'))).toBe('2026-10-20');
	});

	it('startingTarget keeps a kept habit target and prorates a new one', () => {
		const kept = keptSquares(card);
		expect(startingTarget(kept.get('read')!, kept, '2026-10-19')).toBe(7);
		expect(startingTarget(read, new Map(), '2026-10-19')).toBe(4);
	});

	it('targetRows shows an override or the starting target, with the allowed range', () => {
		const draft = { ...emptyDraft('2026-10'), targets: { walk: 5 } };
		expect(targetRows([read, walk], draft, '2026-10-19', new Map())).toEqual([
			{ habit: read, prorated: 4, value: 4, range: { min: 1, max: 31 } },
			{ habit: walk, prorated: 3, value: 5, range: { min: 1, max: 7 } }
		]);
	});
});

describe('readTargets', () => {
	const typed =
		(values: Record<string, string>) =>
		(field: string): string =>
			values[field] ?? '';

	it('keeps only targets that differ from the starting one when building', () => {
		const result = readTargets(
			[read, walk],
			typed({ 'target:read': ' 4 ', 'target:walk': '5' }),
			emptyDraft('2026-10'),
			new Map(),
			'2026-10-19'
		);
		expect(result).toEqual({ ok: true, targets: { walk: 5 } });
	});

	it('keeps every typed target when changing a card', () => {
		const result = readTargets(
			[read],
			typed({ 'target:read': '4' }),
			{ ...emptyDraft('2026-10'), cardId: 'c' },
			new Map(),
			'2026-10-19'
		);
		expect(result).toEqual({ ok: true, targets: { read: 4 } });
	});

	it('reports every bad field with its range, echoing the trimmed text', () => {
		const result = readTargets(
			[read, walk],
			typed({ 'target:read': '1.5', 'target:walk': ' 8 ' }),
			emptyDraft('2026-10'),
			new Map(),
			'2026-10-19'
		);
		expect(result).toEqual({
			ok: false,
			targetErrors: {
				'target:read': 'Pick a number from 1 to 31.',
				'target:walk': 'Pick a number from 1 to 7.'
			},
			targetValues: { 'target:read': '1.5', 'target:walk': '8' }
		});
		const empty = readTargets([read], typed({}), emptyDraft('2026-10'), new Map(), '2026-10-19');
		expect(empty).toMatchObject({ ok: false, targetValues: { 'target:read': '' } });
	});
});

describe('boardPreview', () => {
	it('shows each square as it starts, with the free square in the middle', () => {
		const squares = boardPreview([read, walk], ['read', null, 'walk'], '2026-10-19', 'monday');
		expect(squares).toEqual([
			{ icon: 'book-open', name: 'Read', state: 'empty' },
			{ icon: 'star', name: 'Free', state: 'free' },
			{ icon: 'person-simple-walk', name: 'Walk', state: expect.any(String) }
		]);
	});
});

describe('parseDraft', () => {
	const stored = {
		month: '2026-10',
		cardId: null,
		size: 3,
		habitIds: ['a', 'b'],
		targets: { a: 2 },
		rewards: { bingo: 'Pizza', sixty: '', blackout: '' },
		layout: ['a', null, 'b'],
		completed: ['size', 'habits']
	};

	it('reads a stored draft, dropping unknown keys', () => {
		expect(parseDraft(stored)).toEqual(stored);
		expect(parseDraft({ ...stored, extra: 1, rewards: { ...stored.rewards, extra: 2 } })).toEqual(
			stored
		);
		expect(parseDraft({ ...stored, cardId: 'c', size: null, layout: null })).toEqual({
			...stored,
			cardId: 'c',
			size: null,
			layout: null
		});
		expect(parseDraft({ ...stored, size: 5 })?.size).toBe(5);
	});

	it.each([
		['not an object', 'draft'],
		['null', null],
		['an array', []],
		['a bad month', { ...stored, month: 7 }],
		['a bad card id', { ...stored, cardId: 1 }],
		['a bad size', { ...stored, size: 4 }],
		['bad habit ids', { ...stored, habitIds: [1] }],
		['habit ids not a list', { ...stored, habitIds: 'a' }],
		['bad targets', { ...stored, targets: { a: '2' } }],
		['targets not an object', { ...stored, targets: null }],
		['targets as a list', { ...stored, targets: [1] }],
		['bad rewards', { ...stored, rewards: { bingo: 'x', sixty: '' } }],
		['rewards missing', { ...stored, rewards: undefined }],
		['a bad layout', { ...stored, layout: [1] }],
		['a layout not a list', { ...stored, layout: 'a' }],
		['a bad step', { ...stored, completed: ['dance'] }],
		['steps not a list', { ...stored, completed: 'size' }]
	])('rejects %s', (_, data) => {
		expect(parseDraft(data)).toBeNull();
	});
});
