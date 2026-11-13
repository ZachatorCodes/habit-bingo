import { error, fail } from '@sveltejs/kit';
import { CATEGORIES, isCategoryId, type CategoryId } from '#lib/game/categories.ts';
import { requireUser } from '#lib/server/auth/guards.ts';
import { formText, requireDb } from '#lib/server/request.ts';
import {
	addStarter,
	addedStarterIds,
	archiveHabit,
	listHabits,
	restoreHabit
} from '#lib/server/habits.ts';
import type { Actions, PageServerLoad } from './$types';

const UNAVAILABLE = 'Your habits are not available right now.';

const FULL_MESSAGE = 'You can have up to 100 habits. Archive some to add more.';

async function habitId(request: Request): Promise<string> {
	return formText(await request.formData(), 'id');
}

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = requireUser(locals);
	const db = requireDb(UNAVAILABLE);
	const requested = url.searchParams.get('category') ?? '';
	const category: CategoryId | null = isCategoryId(requested) ? requested : null;
	const archived = url.searchParams.get('archived') === '1';

	// One query for the whole view; filtering and counting happen here so the chips show totals.
	const all = await listHabits(db, user.id, { archived });
	const counts = Object.fromEntries(CATEGORIES.map((c) => [c.id, 0])) as Record<CategoryId, number>;
	for (const habit of all) counts[habit.category] += 1;
	const active = archived ? await listHabits(db, user.id) : all;
	const archivedCount = archived
		? all.length
		: (await listHabits(db, user.id, { archived: true })).length;

	return {
		habits: category ? all.filter((habit) => habit.category === category) : all,
		category,
		archived,
		counts,
		archivedCount,
		addedIds: addedStarterIds(active),
		activeCount: active.length,
		welcome: url.searchParams.get('welcome') === '1',
		created: url.searchParams.get('created') === '1',
		saved: url.searchParams.get('saved') === '1',
		deleted: url.searchParams.get('deleted') === '1'
	};
};

export const actions: Actions = {
	addStarter: async ({ locals, request }) => {
		const user = requireUser(locals);
		const result = await addStarter(
			requireDb(UNAVAILABLE),
			user.id,
			formText(await request.formData(), 'starterId')
		);
		if (!result.ok) return fail(400, { message: result.message });
		return { addedStarter: result.added };
	},

	archive: async ({ locals, request }) => {
		const user = requireUser(locals);
		if (
			!(await archiveHabit(requireDb(UNAVAILABLE), user.id, await habitId(request), new Date()))
		) {
			error(404, 'Not found');
		}
		return { archived: true };
	},

	restore: async ({ locals, request }) => {
		const user = requireUser(locals);
		const result = await restoreHabit(requireDb(UNAVAILABLE), user.id, await habitId(request));
		if (result === false) error(404, 'Not found');
		if (result === 'full') return fail(400, { message: FULL_MESSAGE });
		return { restored: true };
	}
};
