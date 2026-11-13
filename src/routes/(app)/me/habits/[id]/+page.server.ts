import { error, fail, redirect } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/guards.ts';
import { requireDb } from '#lib/server/request.ts';
import { libraryUrl, readHabitForm } from '#lib/server/habit-form.ts';
import { archiveHabit, getHabit, updateHabit } from '#lib/server/habits.ts';
import type { HabitInput } from '#lib/game/types.ts';
import type { Actions, PageServerLoad } from './$types';

const UNAVAILABLE = 'Your habits are not available right now.';

export const load: PageServerLoad = async ({ locals, params }) => {
	const user = requireUser(locals);
	const habit = await getHabit(requireDb(UNAVAILABLE), user.id, params.id);
	if (!habit) error(404, 'Not found');
	const values: HabitInput = {
		icon: habit.icon,
		name: habit.name,
		category: habit.category,
		direction: habit.direction,
		period: habit.period,
		countMode: habit.countMode,
		target: habit.target,
		isPrivate: habit.isPrivate
	};
	return { values, name: habit.name };
};

export const actions: Actions = {
	save: async ({ locals, params, request }) => {
		const user = requireUser(locals);
		const values = await readHabitForm(request);
		const result = await updateHabit(requireDb(UNAVAILABLE), user.id, params.id, values);
		if (result === null) error(404, 'Not found');
		if (!result.ok) return fail(400, { values, errors: { [result.field]: result.message } });
		redirect(303, libraryUrl(result.habit.category, 'saved'));
	},

	archive: async ({ locals, params }) => {
		const user = requireUser(locals);
		if (!(await archiveHabit(requireDb(UNAVAILABLE), user.id, params.id, new Date()))) {
			error(404, 'Not found');
		}
		redirect(303, '/me/habits');
	}
};
