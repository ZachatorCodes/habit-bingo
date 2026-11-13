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
