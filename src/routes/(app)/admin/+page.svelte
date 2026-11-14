<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import Button from '#lib/components/ui/Button.svelte';
	import ConfirmAction from '#lib/components/ui/ConfirmAction.svelte';
	import CopyField from '#lib/components/ui/CopyField.svelte';
	import Hero from '#lib/components/ui/Hero.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import Notice from '#lib/components/ui/Notice.svelte';
	import TextField from '#lib/components/ui/TextField.svelte';
	import { page } from '$app/state';
	import Seo from '#lib/components/ui/Seo.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Section = 'invite' | 'reset';

	const errorsFor = (section: Section): Record<string, string> =>
		form?.section === section && 'errors' in form ? (form.errors ?? {}) : {};
	const valuesFor = (section: Section): Record<string, string> =>
		form?.section === section && 'values' in form ? (form.values ?? {}) : {};

	const inviteErrors = $derived(errorsFor('invite'));
	const resetErrors = $derived(errorsFor('reset'));
	const inviteLink = $derived(form && 'inviteLink' in form ? form.inviteLink : undefined);
	const reset = $derived(
		form && 'resetLink' in form && form.resetLink
			? { link: form.resetLink, username: form.resetUsername ?? '' }
			: undefined
	);

	/** Moves focus to the first problem or the new link, so it is announced. */
	const focusResult: SubmitFunction =
		({ formElement }) =>
		async ({ update }) => {
			await update({ reset: false });
			formElement
				.closest('section')
				?.querySelector<HTMLElement>('[aria-invalid="true"], [data-result] input')
				?.focus();
		};

	const sheet = 'relative rounded-[24px] bg-surface shadow-sheet';
	const inner = 'mx-auto flex max-w-2xl flex-col gap-4 px-4 py-5';
	const heading = 'text-xs font-extrabold tracking-wide text-muted uppercase';
	const result = 'flex flex-col gap-2 rounded-row bg-earned-tile p-4';
</script>

<Seo
	title="Admin"
	description="Your Habit Bingo card and check-ins."
	path={page.url.pathname}
	noindex
/>

<!-- The (app) layout supplies the noindex Seo tags. -->

<Hero title="Admin" summary="Invite people and help them back into their accounts." />

<div class="lg:mx-auto lg:-mt-[18px] lg:grid lg:max-w-5xl lg:grid-cols-2 lg:items-start lg:gap-4">
	<div class="contents lg:flex lg:flex-col lg:gap-4">
		<section aria-labelledby="invites-heading" class="{sheet} -mt-[18px] lg:mt-0">
			<form
				method="POST"
				action="?/createInvite"
				novalidate
				class={inner}
				use:enhance={focusResult}
			>
				<h2 id="invites-heading" class={heading}>Create invite</h2>
				<div class="grid gap-4 sm:grid-cols-2">
					<TextField
						label="Expires in (days)"
						name="expiresInDays"
						type="number"
						min={data.limits.expiresInDays.min}
						max={data.limits.expiresInDays.max}
						hint="1 to 30 days."
						value={valuesFor('invite').expiresInDays ?? data.limits.expiresInDays.default}
						error={inviteErrors.expiresInDays}
					/>
					<TextField
						label="Max uses"
						name="maxUses"
						type="number"
						min={data.limits.maxUses.min}
						max={data.limits.maxUses.max}
						hint="1 to 50 people."
						value={valuesFor('invite').maxUses ?? data.limits.maxUses.default}
						error={inviteErrors.maxUses}
					/>
				</div>
				<Button type="submit" class="self-start">Create invite</Button>
				{#if inviteLink}
					<div data-result class={result}>
						<CopyField label="New invite link" value={inviteLink} copyLabel="Copy invite link" />
					</div>
				{/if}
			</form>
		</section>

		<section aria-labelledby="reset-heading" class="{sheet} mt-4 lg:mt-0">
			<form method="POST" action="?/resetLink" class={inner} use:enhance={focusResult}>
				<h2 id="reset-heading" class={heading}>Reset a password</h2>
				<TextField
					label="Username"
					name="username"
					autocomplete="off"
					hint="The person who is locked out."
					value={valuesFor('reset').username}
					error={resetErrors.username}
				/>
				<Button type="submit" class="self-start">Create reset link</Button>
				{#if reset}
					<div data-result class={result}>
						<CopyField label="Reset link" value={reset.link} copyLabel="Copy reset link" />
						<p class="font-bold">Send this link to them yourself. It works once, for 24 hours.</p>
						<p class="text-sm break-words text-muted">
							For @{reset.username}. It won't be shown again. Using it signs them out everywhere.
						</p>
					</div>
				{/if}
			</form>
		</section>
	</div>
	<section aria-labelledby="list-heading" class="{sheet} mt-4 lg:mt-0">
		<div class={inner}>
			<h2 id="list-heading" class={heading}>Invites</h2>
			{#if form && 'deleted' in form}
				<Notice tone="success">Invite deleted.</Notice>
			{:else if form && 'deleteError' in form}
				<Notice tone="error">{form.deleteError}</Notice>
			{/if}
			{#if data.invites.length > 0}
				<ul aria-labelledby="list-heading" class="flex flex-col gap-2">
					{#each data.invites as invite (invite.code)}
						<li class="flex flex-wrap items-center justify-between gap-3 rounded-row bg-page p-3">
							<div class="flex min-w-0 flex-col gap-1">
								<span class="font-mono font-bold break-all">{invite.code}</span>
								{#if invite.group}
									<span class="text-sm font-bold break-words">
										<Icon name={invite.group.icon} />
										{invite.group.name}
									</span>
								{/if}
								<span class="flex flex-wrap gap-x-3 gap-y-1 text-sm">
									<span>{invite.uses} of {invite.maxUses}</span>
									<span class="text-muted">Expires {invite.expires}</span>
								</span>
							</div>
							<ConfirmAction
								action="?/deleteInvite"
								label="Delete"
								ariaLabel={`Delete invite ${invite.code}`}
								title="Delete this invite?"
								text="Nobody new can use it."
								confirm="Delete"
								fields={{ code: invite.code }}
							/>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="text-muted">No invites yet.</p>
			{/if}
		</div>
	</section>
</div>
