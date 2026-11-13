import type { IconName } from '#lib/icons.ts';
import type { CategoryId } from './categories.ts';
import type { ReactionIcon } from './feed.ts';
import type { HabitRule } from './habit-rules.ts';
import type { SquareState } from './square-state.ts';

// Types shared by the server, the pages and the components. Pure data shapes only.

/** The reward a person picks for each tier of their card. */
export type Rewards = { bingo: string; sixty: string; blackout: string };

/** How a Today row looks: its square's state, progress text, and that day's count. */
export type TodayRowView = {
	state: SquareState;
	progress: number;
	text: string;
	count: number;
};

/** One habit on Today, with how it will look after one more check-in or one fewer. */
export type TodayRowData = TodayRowView & {
	squareId: string;
	icon: string;
	name: string;
	ifLogged: TodayRowView;
	ifUndone: TodayRowView | null;
};

/** A habit in a person's library. */
export type Habit = {
	id: string;
	icon: IconName;
	name: string;
	category: CategoryId;
	isPrivate: boolean;
	archivedAt: Date | null;
} & HabitRule;

/** The habit form's fields as typed; the habits service validates them. */
export type HabitInput = {
	icon: string;
	name: string;
	category: string;
	direction: string;
	period: string;
	countMode?: string;
	target: string | number;
	isPrivate: boolean;
};

/** What a feed event records. */
export type FeedEventType =
	'cardStarted' | 'squareComplete' | 'bingo' | 'sixtyPercent' | 'blackout' | 'checkIn';

/** One feed event as the group page shows it. */
export type FeedItem = {
	id: string;
	type: FeedEventType;
	payload: Record<string, unknown>;
	createdAt: Date;
	author: { userId: string; displayUsername: string | null; avatarIcon: string };
	reactions: Record<ReactionIcon, number>;
	mine: ReactionIcon | null;
};

/** One habit square as the habit sheet shows it (spec §4.6). */
export type SheetData = {
	id: string;
	icon: string;
	name: string;
	/** "Health" */
	category: string;
	/** "8 times a day" */
	rule: string;
	/** `times` gets a stepper, `days` a "Done that day" toggle. */
	countMode: 'times' | 'days';
	period: 'day' | 'week' | 'month';
	state: SquareState;
	progress: number;
	/** Counts toward lines and tiers now. */
	counting: boolean;
	stateText: string;
	progressText: string;
	today: string;
	/** The day being logged. */
	day: string;
	/** That day's count. */
	count: number;
	/** The card's month: every date with its count, and whether it can be logged. */
	calendar: {
		month: string;
		weekStartsOn: 'monday' | 'sunday';
		direction: 'atLeast' | 'atMost';
		days: Record<string, { count: number; loggable: boolean }>;
	};
};
