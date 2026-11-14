import { error, fail, redirect } from '@sveltejs/kit';
import { addDays, lastDayOf, monthOf } from '#lib/game/calendar.ts';
import { backfillMonths, canLog, loggableDates } from '#lib/game/backfill.ts';
import { CATEGORIES } from '#lib/game/categories.ts';
import { evaluateSquare } from '#lib/game/evaluate.ts';
import { describeRule } from '#lib/game/habit-rules.ts';
import { stateText } from '#lib/game/state-text.ts';
import { progressText } from '#lib/game/today.ts';
import type { SheetData } from '#lib/game/types.ts';
import { requireUser } from '#lib/server/auth/guards.ts';
import { getCard } from '#lib/server/cards.ts';
import { getCheckIns, logCheckIn, setCheckIn } from '#lib/server/check-ins.ts';
import { localDate } from '#lib/server/clock.ts';
import { personOf, requestClock, requireDb } from '#lib/server/request.ts';
import type { Actions, PageServerLoad } from './$types';

const UNAVAILABLE = 'Your card is not available right now.';

/** One square of the person's current card, as the habit sheet shows it (spec §4.6). */
export const load: PageServerLoad = async ({ locals, cookies, params, url }) => {
	const user = requireUser(locals);
	const db = requireDb(UNAVAILABLE);
	const timezone = personOf(user).timezone;
	const now = requestClock(cookies);
	const today = localDate(now, timezone);
	// This month's card, and on the 1st–3rd last month's too (its days are still open).
	let card: Awaited<ReturnType<typeof getCard>> = null;
	let square;
	for (const month of backfillMonths(today)) {
		card = await getCard(db, user.id, month);
		square = card?.squares.find((s) => s.id === params.id && !s.isCenter);
		if (square) break;
	}
	if (!card || !square || square.isCenter) error(404, 'Not found');

	const open = loggableDates(today, card.startDate);
	const asked = url.searchParams.get('day');
	const day =
		asked && canLog(asked, today, card.startDate) ? asked : (open.find((d) => d <= today) ?? today);
	const counts = (await getCheckIns(db, card.id)).get(square.id) ?? new Map<string, number>();
	const { state, progress, counting } = evaluateSquare(square, card, counts, today);

	const month = monthOf(card.startDate);
	const days: SheetData['calendar']['days'] = {};
	for (let d = `${month}-01`; d <= lastDayOf(month); d = addDays(d, 1))
		days[d] = { count: counts.get(d) ?? 0, loggable: open.includes(d) };

	const category = CATEGORIES.find((c) => c.id === square.category)!;
	const sheet: SheetData = {
		id: square.id,
		icon: square.icon,
		name: square.name,
		category: category.label,
		rule: describeRule(square),
		countMode: square.period === 'day' ? 'times' : square.countMode,
		period: square.period,
		state,
		progress,
		counting,
		stateText: stateText(square, card, counts, today, state),
		progressText: progressText(square, card, counts, day, today),
		today,
		day,
		count: counts.get(day) ?? 0,
		calendar: { month, weekStartsOn: card.weekStartsOn, direction: square.direction, days }
	};
	return { sheet };
};

async function change(
	{ locals, cookies, params, request, url }: Parameters<Actions[string]>[0],
	how: 'log' | 'unlog' | 'set'
) {
	const user = requireUser(locals);
	const data = await request.formData();
	const date = String(data.get('date') ?? '');
	const person = { id: user.id, timezone: personOf(user).timezone };
	const now = requestClock(cookies);
	const result =
		how === 'set'
			? await setCheckIn(
					requireDb(UNAVAILABLE),
					person,
					params.id,
					date,
					Number(data.get('count')),
					now
				)
			: await logCheckIn(
					requireDb(UNAVAILABLE),
					person,
					params.id,
					date,
					how === 'log' ? 1 : -1,
					now
				);
	if (result === null) error(404, 'Not found');
	if (!result.ok) return fail(400, { message: result.message });
	// Back to the sheet for that day, so a refresh never posts again.
	const day = url.searchParams.get('day');
	redirect(303, `/card/squares/${params.id}${day ? `?day=${encodeURIComponent(day)}` : ''}`);
}

export const actions: Actions = {
	log: (event) => change(event, 'log'),
	unlog: (event) => change(event, 'unlog'),
	set: (event) => change(event, 'set')
};
