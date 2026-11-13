import { fail, redirect } from '@sveltejs/kit';
import { AVATAR_ICONS } from '#lib/icons.ts';
import { isValidTimezone, type WeekStart } from '#lib/profile.ts';
import { completeOnboarding } from '#lib/server/auth/accounts.ts';
import { requireUser } from '#lib/server/auth/guards.ts';
import { readForm, requireDb } from '#lib/server/request.ts';
import type { Actions, PageServerLoad } from './$types';

type Field = 'username' | 'name' | 'avatarIcon' | 'timezone' | 'weekStartsOn' | 'form';

// This page sits outside the (app) group, so it guards itself.
export const load: PageServerLoad = ({ locals, setHeaders }) => {
	const user = requireUser(locals);
	if (user.onboardedAt) redirect(303, '/today');
	setHeaders({ 'cache-control': 'private, no-store' });
	return {
		needsUsername: !user.username,
		name: user.name,
		avatarIcon: (AVATAR_ICONS as readonly string[]).includes(user.avatarIcon ?? '')
			? (user.avatarIcon as string)
			: AVATAR_ICONS[0],
		avatars: AVATAR_ICONS
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const user = requireUser(locals);
		if (user.onboardedAt) redirect(303, '/today');
		const db = requireDb('Onboarding is not available right now.');

		const text = await readForm(request);
		const values = {
			username: text('username'),
			name: text('name'),
			avatarIcon: text('avatarIcon'),
			timezone: text('timezone'),
			weekStartsOn: text('weekStartsOn')
		};

		// Without JavaScript the hidden fields arrive pre-filled with these server defaults.
		const result = await completeOnboarding(
			db,
			user.id,
			{
				username: values.username,
				name: values.name,
				avatarIcon: values.avatarIcon,
				// The browser's zone name can be one this server's ICU does not know (Asia/Calcutta vs
				// Asia/Kolkata); the field is hidden, so fall back to UTC rather than dead-end. It is
				// editable later in settings.
				timezone: isValidTimezone(values.timezone) ? values.timezone : 'UTC',
				weekStartsOn: (values.weekStartsOn || 'monday') as WeekStart
			},
			new Date()
		);
		if (!result.ok) {
			const errors: Partial<Record<Field, string>> = { [result.field as Field]: result.message };
			return fail(400, { values, errors });
		}
		// Step 2 of first-run onboarding (spec §4.2): start the habit library.
		redirect(303, '/me/habits?welcome=1');
	}
};
