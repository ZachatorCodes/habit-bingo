import { error, fail } from '@sveltejs/kit';
import { requireUser } from '#lib/server/auth/guards.ts';
import { createInvite, deleteInvite, listInvites } from '#lib/server/auth/invites.ts';
import { createResetLink } from '#lib/server/auth/password-reset.ts';
import { personOf, requireDb } from '#lib/server/request.ts';
import type { Actions, PageServerLoad } from './$types';

const UNAVAILABLE = 'Admin is not available right now.';

const INVITE_LIMITS = {
	expiresInDays: { min: 1, max: 30, default: 7 },
	maxUses: { min: 1, max: 50, default: 1 }
} as const;

const LIMIT_MESSAGES = {
	expiresInDays: 'Choose between 1 and 30 days.',
	maxUses: 'Choose between 1 and 50 uses.'
} as const;

/**
 * The signed-in admin. Everyone else gets the same 404 as a page that does not exist, for the page
 * and for every action (layout guards do not protect actions).
 */
function requireAdmin(locals: App.Locals) {
	const user = requireUser(locals);
	if (!user.isAdmin) error(404, 'Not Found');
	return user;
}

async function readForm(request: Request) {
	const formData = await request.formData();
	return (key: string) => {
		const value = formData.get(key);
		return typeof value === 'string' ? value.trim() : '';
	};
}

/** A whole number within the field's limits, or null. */
function whole(value: string, field: keyof typeof INVITE_LIMITS): number | null {
	if (!/^\d{1,3}$/.test(value)) return null;
	const n = Number(value);
	const { min, max } = INVITE_LIMITS[field];
	return n >= min && n <= max ? n : null;
}

export const load: PageServerLoad = async ({ locals }) => {
	const user = requireAdmin(locals);
	const db = requireDb(UNAVAILABLE);
	const timeZone = personOf(user).timezone;
	const formatDate = new Intl.DateTimeFormat('en-GB', {
		timeZone,
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});
	const invites = await listInvites(db, new Date());
	return {
		limits: INVITE_LIMITS,
		invites: invites.map((invite) => ({
			code: invite.code,
			group: invite.group,
			uses: invite.uses,
			maxUses: invite.maxUses,
			expires: formatDate.format(invite.expiresAt)
		}))
	};
};

export const actions: Actions = {
	createInvite: async ({ request, locals, url }) => {
		const user = requireAdmin(locals);
		const db = requireDb(UNAVAILABLE);
		const text = await readForm(request);
		const values = { expiresInDays: text('expiresInDays'), maxUses: text('maxUses') };
		const expiresInDays = whole(values.expiresInDays, 'expiresInDays');
		const maxUses = whole(values.maxUses, 'maxUses');
		const errors: Record<string, string> = {};
		if (expiresInDays === null) errors.expiresInDays = LIMIT_MESSAGES.expiresInDays;
		if (maxUses === null) errors.maxUses = LIMIT_MESSAGES.maxUses;
		if (expiresInDays === null || maxUses === null)
			return fail(400, { section: 'invite' as const, values, errors });

		const { code } = await createInvite(
			db,
			{ createdBy: user.id, expiresInDays, maxUses },
			new Date()
		);
		return { section: 'invite' as const, inviteLink: `${url.origin}/join/${code}` };
	},

	deleteInvite: async ({ request, locals }) => {
		requireAdmin(locals);
		const db = requireDb(UNAVAILABLE);
		const code = (await readForm(request))('code');
		if (!(await deleteInvite(db, code, new Date())))
			return fail(404, { deleteError: 'That invite was already gone.' });
		return { deleted: true };
	},

	resetLink: async ({ request, locals, url }) => {
		const user = requireAdmin(locals);
		const db = requireDb(UNAVAILABLE);
		const text = await readForm(request);
		const values = { username: text('username') };
		if (!values.username)
			return fail(400, {
				section: 'reset' as const,
				values,
				errors: { username: 'Enter a username.' } as Record<string, string>
			});

		const result = await createResetLink(
			db,
			{ username: values.username, createdBy: user.id },
			new Date()
		);
		if (!result.ok)
			return fail(400, {
				section: 'reset' as const,
				values,
				errors: { username: result.message } as Record<string, string>
			});
		// Shown once, in this response only: the token is never stored or logged.
		return {
			section: 'reset' as const,
			resetUsername: values.username.replace(/^@/, ''),
			resetLink: `${url.origin}/reset/${result.token}`
		};
	}
};
