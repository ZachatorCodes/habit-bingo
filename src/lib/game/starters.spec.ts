import { describe, expect, it } from 'vitest';
import { isIconName } from '#lib/game/icons.ts';
import { isCategoryId } from './categories';
import { describeRule, normalizeRule } from './habit-rules';
import { STARTERS } from './starters';

describe('STARTERS', () => {
	it('has exactly the ten starters, each a valid rule', () => {
		expect(STARTERS.map((s) => `${s.id} ${s.icon} ${s.name} ${s.category}`)).toEqual([
			'read-book book-open Finish a book learning',
			'bike bicycle Go biking fitness',
			'meditate flower-lotus Meditate mind',
			'power-clean broom Power clean home',
			'litter cat Scoop the litter box home',
			'water drop Drink water health',
			'call-friend phone Call an old friend social',
			'eat-out hamburger Eat out money',
			'naps bed Nap health',
			'no-alcohol wine Alcohol health'
		]);
		for (const starter of STARTERS) {
			expect(isIconName(starter.icon)).toBe(true);
			expect(isCategoryId(starter.category)).toBe(true);
			expect(normalizeRule(starter.rule)).toEqual({ ok: true, rule: starter.rule });
		}
		expect(STARTERS.map((s) => describeRule(s.rule))).toEqual([
			'Once a month',
			'3 times a month',
			'2 days a week',
			'2 days a week',
			'Every day',
			'8 times a day',
			'Once a month',
			'At most 10 times a month',
			'At most 3 days a month',
			'None this month'
		]);
	});
});
