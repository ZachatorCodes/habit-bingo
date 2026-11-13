import { redirect } from '@sveltejs/kit';
import { DEFAULT_AVATAR_ICON } from '#lib/game/icons.ts';
import { requireUser } from '#lib/server/auth/guards.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, url, setHeaders }) => {
	// Page visits come back to where they started; requireUser covers everything else.
	if (!locals.user) {
		redirect(303, '/signin?next=' + encodeURIComponent(url.pathname + url.search));
	}
	const user = requireUser(locals);
	if (!user.onboardedAt) redirect(303, '/onboarding');
	// Personal pages: never stored by a shared cache.
	setHeaders({ 'cache-control': 'private, no-store' });

	const { id, username, displayUsername, name, avatarIcon, isAdmin } = user;
	return {
		user: {
			id,
			displayUsername: displayUsername ?? username ?? name,
			name,
			avatarIcon: avatarIcon ?? DEFAULT_AVATAR_ICON,
			isAdmin: isAdmin ?? false
		}
	};
};
