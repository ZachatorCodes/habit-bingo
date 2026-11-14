import type { IconName } from '#lib/game/icons.ts';
import type { CategoryId } from './categories.ts';
import type { HabitRule } from './habit-rules.ts';

export type Starter = {
	id: string;
	icon: IconName;
	name: string;
	category: CategoryId;
	rule: HabitRule;
};

/** Tap-to-add suggestions shown after onboarding and in an empty library (spec §4.2). */
export const STARTERS: readonly Starter[] = [
	{
		id: 'read-book',
		icon: 'book-open',
		name: 'Finish a book',
		category: 'learning',
		rule: { direction: 'atLeast', period: 'month', countMode: 'days', target: 1 }
	},
	{
		id: 'bike',
		icon: 'bicycle',
		name: 'Go biking',
		category: 'fitness',
		rule: { direction: 'atLeast', period: 'month', countMode: 'times', target: 3 }
	},
	{
		id: 'meditate',
		icon: 'flower-lotus',
		name: 'Meditate',
		category: 'mind',
		rule: { direction: 'atLeast', period: 'week', countMode: 'days', target: 2 }
	},
	{
		id: 'power-clean',
		icon: 'broom',
		name: 'Power clean',
		category: 'home',
		rule: { direction: 'atLeast', period: 'week', countMode: 'days', target: 2 }
	},
	{
		id: 'litter',
		icon: 'cat',
		name: 'Scoop the litter box',
		category: 'home',
		rule: { direction: 'atLeast', period: 'day', countMode: 'times', target: 1 }
	},
	{
		id: 'water',
		icon: 'drop',
		name: 'Drink water',
		category: 'health',
		rule: { direction: 'atLeast', period: 'day', countMode: 'times', target: 8 }
	},
	{
		id: 'call-friend',
		icon: 'phone',
		name: 'Call an old friend',
		category: 'social',
		rule: { direction: 'atLeast', period: 'month', countMode: 'days', target: 1 }
	},
	{
		id: 'eat-out',
		icon: 'hamburger',
		name: 'Eat out',
		category: 'money',
		rule: { direction: 'atMost', period: 'month', countMode: 'times', target: 10 }
	},
	{
		id: 'naps',
		icon: 'bed',
		name: 'Nap',
		category: 'health',
		rule: { direction: 'atMost', period: 'month', countMode: 'days', target: 3 }
	},
	{
		id: 'no-alcohol',
		icon: 'wine',
		name: 'Alcohol',
		category: 'health',
		rule: { direction: 'atMost', period: 'month', countMode: 'days', target: 0 }
	}
];
