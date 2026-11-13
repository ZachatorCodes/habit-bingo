import { error } from '@sveltejs/kit';
import { TEST_CLOCK } from '$app/env/private';
import { monthName, monthOf } from '#lib/game/calendar.ts';
import { middleReward } from '#lib/game/card-layout.ts';
import { categoryBreakdown, mostLogged } from '#lib/game/recap.ts';
import { requireUser } from '#lib/server/auth/guards.ts';
import { cardView } from '#lib/server/card-view.ts';
import { getCard } from '#lib/server/cards.ts';
import { getCheckIns } from '#lib/server/check-ins.ts';
import { localDate, requestNow } from '#lib/server/clock.ts';
import { getDb } from '#lib/server/db/client.ts';
import { finalizeMonths, getResult, markSeen } from '#lib/server/month-results.ts';
import type { PageServerLoad } from './$types';

/** A finished month's recap (spec §4.11). Opening it marks it seen. */
export const load: PageServerLoad = async ({ locals, cookies, params }) => {
	const user = requireUser(locals);
	if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(params.month)) error(404, 'Not found');
	const db = getDb();
	if (!db) error(503, 'Your history is not available right now.');
	const now = requestNow(cookies, TEST_CLOCK);
	const today = localDate(now, user.timezone ?? 'UTC');
	await finalizeMonths(db, user.id, today);
	const [result, card, current] = await Promise.all([
		getResult(db, user.id, params.month),
		getCard(db, user.id, params.month),
		getCard(db, user.id, monthOf(today))
	]);
	if (!result || !card) error(404, 'Not found');

	const [{ squares }, checkIns] = await Promise.all([
		cardView(db, user.id, card, today),
		getCheckIns(db, card.id)
	]);
	const habitSquares = card.squares.flatMap((square, index) =>
		square.isCenter ? [] : [{ ...square, state: squares[index].state }]
	);
	const labels = {
		bingo: 'First bingo',
		sixtyPercent: `${middleReward(card.size, params.month)} squares`,
		blackout: 'Blackout'
	};
	const rewards = {
		bingo: card.rewards.bingo,
		sixtyPercent: card.rewards.sixty,
		blackout: card.rewards.blackout
	};
	await markSeen(db, user.id, params.month, now);

	return {
		monthName: monthName(params.month),
		size: card.size,
		// Read-only: no habit sheet, no link to next month.
		board: squares.map(({ icon, name, state, progress }) => ({ icon, name, state, progress })),
		result,
		squares: card.size ** 2,
		rewards: result.tiers.map((tier) => ({ label: labels[tier], reward: rewards[tier] })),
		highlight: mostLogged(habitSquares, checkIns),
		categories: categoryBreakdown(habitSquares),
		buildCard: current === null,
		buildMonthName: monthName(monthOf(today))
	};
};
