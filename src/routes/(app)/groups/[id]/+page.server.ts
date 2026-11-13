import { error, fail, redirect } from '@sveltejs/kit';
import { TEST_CLOCK } from '$app/env/private';
import { requireUser } from '#lib/server/auth/guards.ts';
import { requestNow } from '#lib/server/clock.ts';
import { requireDb } from '#lib/server/request.ts';
import { groupFeed, react } from '#lib/server/feed.ts';
import {
	getMembership,
	leaveGroup,
	listMembers,
	removeMember,
	resetInvite
} from '#lib/server/groups.ts';
import { groupBoard } from '#lib/server/leaderboard.ts';
import type { Actions, PageServerLoad } from './$types';

const UNAVAILABLE = 'Groups are not available right now.';

export const load: PageServerLoad = async ({ locals, cookies, params, url }) => {
	const user = requireUser(locals);
	const db = requireDb(UNAVAILABLE);
	const now = requestNow(cookies, TEST_CLOCK);
	const membership = await getMembership(db, user.id, params.id, now);
	if (!membership) error(404, 'Not found');
	const t = url.searchParams.get('tab');
	const tab = t === 'members' || t === 'leaderboard' ? t : 'feed';
	const members = await listMembers(db, params.id);
	const feed = await groupFeed(db, user.id, params.id, url.searchParams.get('before') ?? undefined);
	const leaderboard = await groupBoard(db, user.id, params.id, now);
	if (!leaderboard || !feed) error(404, 'Not found');
	const heir = members.find((m) => m.userId !== user.id);
	return {
		group: membership.group,
		isOwner: membership.role === 'owner',
		updated: url.searchParams.get('updated') === '1',
		tab,
		members: members.map(({ userId, displayUsername, avatarIcon, role }) => ({
			userId,
			displayUsername: displayUsername ?? 'Someone',
			avatarIcon,
			role
		})),
		inviteLink: membership.inviteCode ? `${url.origin}/join/${membership.inviteCode}` : null,
		// Matches leaveGroup: the first other member by join order inherits.
		nextOwner: heir ? (heir.displayUsername ?? 'Someone') : null,
		// Always loaded: the group page shows both panes side by side at lg.
		leaderboard,
		feed,
		now
	};
};

export const actions: Actions = {
	react: async ({ locals, request }) => {
		const user = requireUser(locals);
		const db = requireDb(UNAVAILABLE);
		const form = await request.formData();
		const [eventId, icon] = [form.get('eventId'), form.get('icon')];
		if (typeof eventId !== 'string' || typeof icon !== 'string')
			return fail(400, { message: 'Pick a reaction.' });
		const result = await react(db, user.id, eventId, icon);
		if (result === 'notFound') error(404, 'Not found');
		if (result === 'badIcon') return fail(400, { message: 'Pick a reaction.' });
	},
	leave: async ({ locals, cookies, params }) => {
		const user = requireUser(locals);
		const db = requireDb(UNAVAILABLE);
		if (!(await getMembership(db, user.id, params.id, requestNow(cookies, TEST_CLOCK))))
			error(404, 'Not found');
		const result = await leaveGroup(db, user.id, params.id, requestNow(cookies, TEST_CLOCK));
		if (!result) error(404, 'Not found');
		redirect(303, '/groups');
	},
	remove: async ({ locals, cookies, params, request }) => {
		const user = requireUser(locals);
		const db = requireDb(UNAVAILABLE);
		if (!(await getMembership(db, user.id, params.id, requestNow(cookies, TEST_CLOCK))))
			error(404, 'Not found');
		const memberId = (await request.formData()).get('userId');
		if (typeof memberId !== 'string' || !(await removeMember(db, user.id, params.id, memberId)))
			error(404, 'Not found');
		redirect(303, `/groups/${params.id}?tab=members`);
	},
	reset: async ({ locals, cookies, params }) => {
		const user = requireUser(locals);
		const db = requireDb(UNAVAILABLE);
		if (!(await getMembership(db, user.id, params.id, requestNow(cookies, TEST_CLOCK))))
			error(404, 'Not found');
		if (!(await resetInvite(db, user.id, params.id, requestNow(cookies, TEST_CLOCK))))
			error(404, 'Not found');
		redirect(303, `/groups/${params.id}?tab=members`);
	}
};
