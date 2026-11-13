import { error, fail, redirect } from '@sveltejs/kit';
import { backfillDates, backfillMonths } from '#lib/game/backfill.ts';
import { monthName, monthOf } from '#lib/game/calendar.ts';
import { CARD_SIZES } from '#lib/game/card-layout.ts';
import { evaluateSquare } from '#lib/game/evaluate.ts';
import { nudges } from '#lib/game/nudges.ts';
import { progressText, todaySection, type TodaySection } from '#lib/game/today.ts';
import type { TodayRowData } from '#lib/components/TodayRow.svelte';
import { requireUser } from '#lib/server/auth/guards.ts';
import { getCard, type Card } from '#lib/server/cards.ts';
import { cardView } from '#lib/server/card-view.ts';
import { getCheckIns, logCheckIn, MAX_COUNT } from '#lib/server/check-ins.ts';
import { localDate, localHour } from '#lib/server/clock.ts';
import { personOf, requestClock, requireDb } from '#lib/server/request.ts';
import { finalizeMonths, markSeen, newestUnseen } from '#lib/server/month-results.ts';
import type { Actions, PageServerLoad } from './$types';

const UNAVAILABLE = 'Today is not available right now.';

export const load: PageServerLoad = async ({ locals, cookies, url }) => {
	const user = requireUser(locals);
	const db = requireDb(UNAVAILABLE);
	const timezone = personOf(user).timezone;
	const now = requestClock(cookies);
	const today = localDate(now, timezone);
	const month = monthOf(today);
	const name = user.name;
	const hour = localHour(now, timezone);
	// This month's card, and on the 1st–3rd last month's too, for its last days (spec §3.8).
	const cards = (
		await Promise.all(backfillMonths(today).map((m) => getCard(db, user.id, m)))
	).filter((c): c is Card => c !== null);
	const buildCard = !cards.some((c) => c.month === month);
	// A finished month's recap waits behind a banner until it is opened or dismissed (spec §4.11).
	await finalizeMonths(db, user.id, today);
	const unseen = await newestUnseen(db, user.id);
	const recap = unseen && { month: unseen.month, monthName: monthName(unseen.month) };
	const days = cards.flatMap((c) => backfillDates(today, c.startDate));
	if (days.length === 0)
		return { name, hour, monthName: monthName(month), buildCard, recap, card: null, board: null };

	const asked = url.searchParams.get('day');
	// Only the backfill window can be logged; anything else shows the newest day.
	const day = asked && days.includes(asked) ? asked : days[0];
	const card = cards.find((c) => c.month === monthOf(day))!;
	const checkIns = await getCheckIns(db, card.id);

	const sections: Record<TodaySection, TodayRowData[]> = {
		doToday: [],
		thisWeek: [],
		done: [],
		anytime: [],
		slip: []
	};
	for (const square of card.squares) {
		if (square.isCenter) continue;
		const counts = checkIns.get(square.id) ?? new Map<string, number>();
		const count = counts.get(day) ?? 0;
		// The row as it is, and as it will be after one more check-in or one fewer, so the page can
		// show the result before the server answers (spec §6).
		const view = (dayCount: number) => {
			const next = new Map(counts);
			if (dayCount > 0) next.set(day, dayCount);
			else next.delete(day);
			return {
				...evaluateSquare(square, card, next, today),
				text: progressText(square, card, next, day, today),
				count: dayCount
			};
		};
		sections[todaySection(square, card, counts, day)].push({
			squareId: square.id,
			icon: square.icon,
			name: square.name,
			...view(count),
			ifLogged: view(Math.min(count + 1, MAX_COUNT)),
			ifUndone: count > 0 ? view(count - 1) : null
		});
	}
	const board = await cardView(db, user.id, card, today, checkIns);
	// Heads up (spec §4.8): only on today's view of this month's card.
	const headsUp =
		day === today
			? nudges({
					size: card.size,
					span: card,
					today,
					squares: card.squares.map((square, index) => ({
						id: square.isCenter ? null : square.id,
						name: board.squares[index].name,
						state: board.squares[index].state,
						counting: board.squares[index].counting,
						rule: square.isCenter ? null : square,
						counts: checkIns.get(square.id) ?? new Map<string, number>()
					})),
					rewards: card.rewards,
					nextMonthName: board.nextMonthName
				})
			: [];
	return {
		name,
		hour,
		monthName: monthName(month),
		buildCard,
		recap,
		headsUp,
		board: { squares: board.squares, score: board.score, size: card.size },
		card: {
			id: card.id,
			today,
			day,
			days,
			sections,
			// The card's score, so a log that completes a line can celebrate here too (spec §4.7).
			score: board.score,
			rewards: card.rewards,
			sixtyThreshold: CARD_SIZES[card.size].sixtyThreshold
		},
		/** The page's own query, carried through the log/unlog actions. */
		keep: day === days[0] ? '' : `&day=${day}`
	};
};

async function log(
	{ locals, cookies, request, url }: Parameters<Actions[string]>[0],
	delta: 1 | -1
) {
	const user = requireUser(locals);
	const data = await request.formData();
	const field = (name: string) => {
		const value = data.get(name);
		return typeof value === 'string' ? value : '';
	};
	const result = await logCheckIn(
		requireDb(UNAVAILABLE),
		{ id: user.id, timezone: personOf(user).timezone },
		field('squareId'),
		field('date'),
		delta,
		requestClock(cookies)
	);
	if (result === null) error(404, 'Not found');
	if (!result.ok) return fail(400, { message: result.message });
	// Back to the day being logged, so a refresh doesn't post again.
	const day = url.searchParams.get('day');
	redirect(303, day ? `/today?day=${encodeURIComponent(day)}` : '/today');
}

export const actions: Actions = {
	log: (event) => log(event, 1),
	unlog: (event) => log(event, -1),
	dismissRecap: async ({ locals, cookies, request, url }) => {
		const user = requireUser(locals);
		const month = (await request.formData()).get('month');
		if (typeof month === 'string') {
			await markSeen(requireDb(UNAVAILABLE), user.id, month, requestClock(cookies));
		}
		const day = url.searchParams.get('day');
		redirect(303, day ? `/today?day=${encodeURIComponent(day)}` : '/today');
	}
};
