import { describe, expect, it } from 'vitest';
import { evaluateSquare, type CardSpan } from './evaluate.ts';
import type { HabitRule } from './habit-rules.ts';

const span: CardSpan = { startDate: '2026-10-01', weekStartsOn: 'monday' };
const counts = (entries: Record<string, number>) => new Map(Object.entries(entries));
const rule = (
	direction: HabitRule['direction'],
	period: HabitRule['period'],
	countMode: HabitRule['countMode'],
	target: number
): HabitRule => ({ direction, period, countMode, target });
/** Every date from `from` to `to` with `count`. */
function range(from: string, to: string, count = 1): Record<string, number> {
	const out: Record<string, number> = {};
	for (let d = new Date(from); d <= new Date(to); d.setUTCDate(d.getUTCDate() + 1)) {
		out[d.toISOString().slice(0, 10)] = count;
	}
	return out;
}
const TODAY = '2026-10-20'; // a Tuesday

describe('earn squares (atLeast / month)', () => {
	const read = rule('atLeast', 'month', 'days', 4);

	it('empty, inProgress with progress, complete', () => {
		expect(evaluateSquare(read, span, counts({}), TODAY)).toMatchObject({
			state: 'empty',
			progress: 0
		});
		expect(
			evaluateSquare(read, span, counts({ '2026-10-02': 1, '2026-10-05': 1 }), TODAY)
		).toMatchObject({ state: 'inProgress', progress: 0.5 });
		expect(
			evaluateSquare(read, span, counts(range('2026-10-01', '2026-10-05')), TODAY)
		).toMatchObject({
			state: 'complete',
			progress: 1
		});
	});

	it('counts times or days by count mode', () => {
		const twice = counts({ '2026-10-02': 2 });
		const times = rule('atLeast', 'month', 'times', 4);
		expect(evaluateSquare(times, span, twice, TODAY).progress).toBe(0.5);
		expect(evaluateSquare(read, span, twice, TODAY).progress).toBe(0.25);
	});
});

describe('atLeast / day', () => {
	const walk = rule('atLeast', 'day', 'times', 1);

	it('held when every past day is met; today missing alone is fine', () => {
		expect(
			evaluateSquare(walk, span, counts(range('2026-10-01', '2026-10-19')), TODAY)
		).toMatchObject({
			state: 'held',
			progress: 0
		});
	});

	it('atRisk for a missed day still in the window', () => {
		const days = range('2026-10-01', '2026-10-20');
		delete days['2026-10-18'];
		expect(evaluateSquare(walk, span, counts(days), TODAY).state).toBe('atRisk');
	});

	it('lost once the month closes with a day missed', () => {
		const days = range('2026-10-01', '2026-10-31');
		delete days['2026-10-15'];
		expect(evaluateSquare(walk, span, counts(days), '2026-11-04').state).toBe('lost');
	});

	it('a day missed over 3 days ago stops counting, and logging it later wins the square back', () => {
		const days = range('2026-10-01', '2026-10-24');
		delete days['2026-10-14'];
		expect(evaluateSquare(walk, span, counts(days), '2026-10-24').state).toBe('lost');
		days['2026-10-14'] = 1; // backfilled from the calendar
		expect(evaluateSquare(walk, span, counts(days), '2026-10-24').state).toBe('held');
	});

	it('needs N check-ins to meet a day', () => {
		const water = rule('atLeast', 'day', 'times', 8);
		const days = range('2026-10-01', '2026-10-20', 8);
		days['2026-10-19'] = 7;
		expect(evaluateSquare(water, span, counts(days), TODAY).state).toBe('atRisk');
	});

	it('days before the card started do not count', () => {
		const late: CardSpan = { startDate: '2026-10-18', weekStartsOn: 'monday' };
		const days = counts(range('2026-10-18', '2026-10-19'));
		expect(evaluateSquare(walk, late, days, TODAY).state).toBe('held');
	});
});

describe('atLeast / week', () => {
	const gym = rule('atLeast', 'week', 'days', 3);
	// Weeks met before the current one: Oct 1–4 needs 2, then 3 per week.
	const earlier = {
		...range('2026-10-01', '2026-10-02'),
		...range('2026-10-05', '2026-10-07'),
		...range('2026-10-12', '2026-10-14')
	};

	it('atRisk when the days left in the week are no more than the shortfall', () => {
		const saturday = '2026-10-24'; // Saturday and Sunday left
		const one = counts({ ...earlier, ...range('2026-10-19', '2026-10-19') });
		const two = counts({ ...earlier, ...range('2026-10-19', '2026-10-20') });
		expect(evaluateSquare(gym, span, one, saturday).state).toBe('atRisk');
		expect(evaluateSquare(gym, span, two, saturday).state).toBe('held');
	});

	it('a short past week is atRisk while the month is open, then lost', () => {
		const shortLastWeek = counts({
			...range('2026-10-01', '2026-10-02'),
			...range('2026-10-05', '2026-10-07'),
			'2026-10-12': 1
		});
		expect(evaluateSquare(gym, span, shortLastWeek, TODAY).state).toBe('atRisk');
		const shortEarlier = counts({
			...range('2026-10-01', '2026-10-02'),
			'2026-10-05': 1,
			...range('2026-10-12', '2026-10-14')
		});
		expect(evaluateSquare(gym, span, shortEarlier, '2026-11-04').state).toBe('lost');
	});

	it('a week missed on Oct 8 is lost on Oct 24, and won back once its days are logged', () => {
		const missed = {
			...range('2026-10-01', '2026-10-02'),
			...range('2026-10-12', '2026-10-24')
		};
		expect(evaluateSquare(gym, span, counts(missed), '2026-10-24').state).toBe('lost');
		const caughtUp = counts({ ...missed, ...range('2026-10-05', '2026-10-07') });
		expect(evaluateSquare(gym, span, caughtUp, '2026-10-24').state).toBe('held');
	});

	it('a 1-day stub week requiring nothing is not a met week', () => {
		const sundayStart: CardSpan = { startDate: '2026-10-18', weekStartsOn: 'monday' };
		expect(evaluateSquare(gym, sundayStart, counts({}), '2026-10-18')).toMatchObject({
			state: 'empty',
			counting: false
		});
		expect(evaluateSquare(gym, sundayStart, counts({}), '2026-10-20').state).toBe('empty');
	});

	it('a log in a stub week requiring nothing starts the square', () => {
		const sundayStart: CardSpan = { startDate: '2026-10-18', weekStartsOn: 'monday' };
		expect(
			evaluateSquare(gym, sundayStart, counts({ '2026-10-18': 1 }), '2026-10-18')
		).toMatchObject({ state: 'held', counting: false });
	});

	it('is empty until a week is met, the current week included', () => {
		expect(evaluateSquare(gym, span, counts({}), '2026-10-02')).toMatchObject({
			state: 'empty',
			counting: false
		});
		const met = counts(range('2026-10-01', '2026-10-02'));
		expect(evaluateSquare(gym, span, met, '2026-10-02')).toMatchObject({
			state: 'held',
			counting: false
		});
	});
});

describe('when protect squares count', () => {
	const walk = rule('atLeast', 'day', 'times', 1);

	it('"every day" is empty until a day is met, then held', () => {
		expect(evaluateSquare(walk, span, counts({}), '2026-10-01')).toEqual({
			state: 'empty',
			progress: 0,
			counting: false
		});
		const first = counts({ '2026-10-01': 1 });
		expect(evaluateSquare(walk, span, first, '2026-10-01')).toMatchObject({
			state: 'held',
			counting: false
		});
		expect(evaluateSquare(walk, span, first, '2026-10-02')).toMatchObject({
			state: 'held',
			counting: false
		});
	});

	it('a missed day in the window before any met day is still empty', () => {
		expect(evaluateSquare(walk, span, counts({}), '2026-10-03').state).toBe('empty');
	});

	it('a settled miss before the first met day is lost', () => {
		expect(evaluateSquare(walk, span, counts({}), '2026-10-06')).toMatchObject({
			state: 'lost',
			counting: false
		});
	});

	it('"at most" squares do not count during the month and count after it', () => {
		for (const period of ['day', 'week', 'month'] as const) {
			const limit = rule('atMost', period, 'days', 3);
			for (const [today, counting] of [
				['2026-10-15', false],
				['2026-10-31', false],
				['2026-11-01', true]
			] as const) {
				expect(evaluateSquare(limit, span, counts({}), today)).toMatchObject({
					state: 'held',
					counting
				});
			}
		}
	});

	it('a lost "at most" square never counts', () => {
		const none = rule('atMost', 'month', 'days', 0);
		expect(evaluateSquare(none, span, counts({ '2026-10-02': 1 }), '2026-11-01')).toMatchObject({
			state: 'lost',
			counting: false
		});
	});

	it('earn squares count when complete', () => {
		const read = rule('atLeast', 'month', 'days', 1);
		expect(evaluateSquare(read, span, counts({ '2026-10-02': 1 }), TODAY).counting).toBe(true);
		expect(evaluateSquare(read, span, counts({}), TODAY).counting).toBe(false);
	});
});

describe('limits', () => {
	it('atMost / day: atRisk at the limit today, lost over it on any day', () => {
		const coffee = rule('atMost', 'day', 'times', 1);
		expect(evaluateSquare(coffee, span, counts({ [TODAY]: 1 }), TODAY).state).toBe('atRisk');
		expect(evaluateSquare(coffee, span, counts({ '2026-10-19': 1 }), TODAY).state).toBe('held');
		expect(evaluateSquare(coffee, span, counts({ '2026-10-03': 2 }), TODAY).state).toBe('lost');
	});

	it("atMost / week: atRisk at the week's limit, lost over any week's", () => {
		const eatOut = rule('atMost', 'week', 'times', 2);
		expect(evaluateSquare(eatOut, span, counts({ '2026-10-19': 2 }), TODAY).state).toBe('atRisk');
		expect(evaluateSquare(eatOut, span, counts({ '2026-10-19': 1 }), TODAY).state).toBe('held');
		// The 4-day stub week Oct 1–4 allows ceil(2 × 4 / 7) = 2.
		expect(evaluateSquare(eatOut, span, counts({ '2026-10-02': 3 }), TODAY).state).toBe('lost');
	});

	it('atMost / month: atRisk at the limit, lost over it', () => {
		const naps = rule('atMost', 'month', 'days', 3);
		const three = counts({ '2026-10-02': 1, '2026-10-09': 1, '2026-10-19': 1 });
		expect(evaluateSquare(naps, span, three, TODAY).state).toBe('atRisk');
		expect(evaluateSquare(naps, span, counts({ '2026-10-02': 5 }), TODAY).state).toBe('held');
		const four = counts(range('2026-10-01', '2026-10-04'));
		expect(evaluateSquare(naps, span, four, TODAY).state).toBe('lost');
	});

	it('limit 0: one slip away from losing, and lost on any slip', () => {
		const none = rule('atMost', 'month', 'days', 0);
		expect(evaluateSquare(none, span, counts({}), TODAY).state).toBe('atRisk');
		expect(evaluateSquare(none, span, counts({ '2026-10-05': 1 }), TODAY).state).toBe('lost');
	});

	it('an at-most square recovers when its slip is removed', () => {
		const coffee = rule('atMost', 'day', 'times', 1);
		expect(evaluateSquare(coffee, span, counts({ '2026-10-10': 2 }), TODAY).state).toBe('lost');
		expect(evaluateSquare(coffee, span, counts({ '2026-10-10': 1 }), TODAY).state).toBe('held');
	});

	it('removing the slip restores the square', () => {
		const coffee = rule('atMost', 'day', 'times', 1);
		expect(evaluateSquare(coffee, span, counts({ [TODAY]: 2 }), TODAY).state).toBe('lost');
		expect(evaluateSquare(coffee, span, counts({ [TODAY]: 1 }), TODAY).state).toBe('atRisk');
	});
});

it('ignores dates after today', () => {
	const read = rule('atLeast', 'month', 'days', 4);
	const later = counts(range('2026-10-21', '2026-10-25'));
	expect(evaluateSquare(read, span, later, TODAY).state).toBe('empty');
});

describe('only completed squares count before the month is over', () => {
	it('"every day" and "every week" squares count only after the last card day', () => {
		const walk = rule('atLeast', 'day', 'times', 1);
		const everyDay = counts(range('2026-10-01', '2026-10-31'));
		expect(evaluateSquare(walk, span, everyDay, '2026-10-31')).toMatchObject({
			state: 'held',
			counting: false
		});
		expect(evaluateSquare(walk, span, everyDay, '2026-11-01').counting).toBe(true);
		const gym = rule('atLeast', 'week', 'days', 1);
		expect(evaluateSquare(gym, span, everyDay, '2026-10-31').counting).toBe(false);
		expect(evaluateSquare(gym, span, everyDay, '2026-11-01').counting).toBe(true);
	});

	it('a lost "every day" square never counts', () => {
		const walk = rule('atLeast', 'day', 'times', 1);
		expect(evaluateSquare(walk, span, counts({ '2026-10-01': 1 }), '2026-11-01')).toMatchObject({
			state: 'lost',
			counting: false
		});
	});
});
