import { fail, redirect } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/guards.ts';
import { requireDb } from '#lib/server/request.ts';
import { DEFAULT_HABIT_INPUT, libraryUrl, readHabitForm } from '#lib/server/habit-form.ts';
import { createHabit } from '#lib/server/habits.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	requireUser(locals);
	return { values: DEFAULT_HABIT_INPUT };
};

export const actions: Actions = {
	default: async ({ locals, request }) => {
		const user = requireUser(locals);
		const db = requireDb('Your habits are not available right now.');
		const values = await readHabitForm(request);
		const result = await createHabit(db, user.id, values);
		if (!result.ok) {
			return fail(400, { values, errors: { [result.field]: result.message } });
		}
		redirect(303, libraryUrl(result.habit.category, 'created'));
	}
};
