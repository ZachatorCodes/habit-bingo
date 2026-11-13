<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { resolve } from '$app/paths';
	import Button from '#lib/components/ui/Button.svelte';
	import Hero from '#lib/components/ui/Hero.svelte';
	import Notice from '#lib/components/ui/Notice.svelte';
	import Icon from '#lib/components/ui/Icon.svelte';
	import IconPicker from '#lib/components/ui/IconPicker.svelte';
	import TextField from '#lib/components/ui/TextField.svelte';
	import { page } from '$app/state';
	import Seo from '#lib/components/ui/Seo.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	type Section = 'profile' | 'settings' | 'password' | 'methods' | 'delete';

	const errorsFor = (section: Section): Record<string, string> =>
		form?.section === section && 'errors' in form ? (form.errors ?? {}) : {};
	const valuesFor = (section: Section): Record<string, string> =>
		form?.section === section && 'values' in form ? (form.values ?? {}) : {};
	const savedIn = (section: Section) => form?.section === section && 'saved' in form;

	const profileErrors = $derived(errorsFor('profile'));
	const settingsErrors = $derived(errorsFor('settings'));
	const passwordErrors = $derived(errorsFor('password'));
	const methodErrors = $derived(errorsFor('methods'));
	const deleteErrors = $derived(errorsFor('delete'));

	// svelte-ignore state_referenced_locally
	let avatar = $state(data.profile.avatarIcon);
	// svelte-ignore state_referenced_locally
	let timezone = $state(data.settings.timezone);
	// svelte-ignore state_referenced_locally
	let weekStartsOn = $state(data.settings.weekStartsOn);

	/**
	 * Applies the result, then moves focus to the first problem or the confirmation, so it is
	 * announced. Password forms are cleared afterwards; passwords never come back from the server.
	 */
	const focusResult =
		(reset: boolean): SubmitFunction =>
		({ formElement }) =>
		async ({ update }) => {
			await update({ reset });
			formElement
				.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"], [role="status"]')
				?.focus();
		};

	const sheet = 'rounded-[24px] bg-surface shadow-sheet';
	const inner = 'mx-auto flex max-w-xl flex-col gap-4 px-4 py-5';
	const heading = 'text-xs font-extrabold tracking-wide text-muted uppercase';
	const select =
		'w-full rounded-[14px] border border-line bg-surface px-4 py-2.5 text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-forest';
	const links = [
		{
			href: resolve('/(app)/me/habits'),
			icon: 'notebook',
			title: 'Habit library',
			text: 'Create and organize the habits you put on cards.'
		},
		{
			href: resolve('/(app)/me/history'),
			icon: 'target',
			title: 'History',
			text: 'Your finished months and their recaps.'
		}
	];
</script>

<Seo
	title="Me"
	description="Your Habit Bingo card and check-ins."
	path={page.url.pathname}
	noindex
/>

{#snippet saved(message: string)}
	<p role="status" tabindex="-1" class="rounded-row bg-earned-tile px-4 py-3 font-bold text-ink">
		<Icon name="check-circle" class="text-forest" />
		{message}
	</p>
{/snippet}

{#snippet problem(message: string | undefined)}
	{#if message}
		<Notice tone="error">{message}</Notice>
	{/if}
{/snippet}

<Hero title={data.profile.name}>
	<div class="mt-3 flex items-center gap-3">
		<span
			aria-hidden="true"
			class="grid size-12 shrink-0 place-items-center rounded-full bg-earned-tile text-3xl text-forest"
			><Icon name={data.profile.avatarIcon} /></span
		>
	</div>
</Hero>

<div
	class="relative -mt-[18px] flex flex-col gap-4 pb-4 lg:mx-auto lg:grid lg:max-w-5xl lg:grid-cols-2 lg:items-start"
>
	<div class="contents lg:flex lg:flex-col lg:gap-4">
		<section class={sheet}>
			<ul class="{inner} gap-2">
				{#each links as row (row.title)}
					<li>
						<a
							href={row.href}
							class="flex min-h-14 items-center gap-3 rounded-row bg-page p-3 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink"
						>
							<span
								aria-hidden="true"
								class="grid size-10 shrink-0 place-items-center rounded-full bg-earned-tile text-2xl text-forest"
								><Icon name={row.icon} /></span
							>
							<span class="min-w-0 flex-1">
								<span class="block font-bold">{row.title}</span>
								<span class="block text-sm text-muted">{row.text}</span>
							</span>
							<Icon name="caret-right" class="text-muted" />
						</a>
					</li>
				{/each}
			</ul>
		</section>

		<section aria-labelledby="profile-heading" class={sheet}>
			<form method="POST" action="?/profile" class={inner} use:enhance={focusResult(false)}>
				<h2 id="profile-heading" class={heading}>Profile</h2>
				{#if savedIn('profile')}{@render saved('Profile saved.')}{/if}
				<div class="flex flex-col gap-1.5">
					<span class="font-extrabold">Username</span>
					<p class="text-lg font-bold break-words">@{data.profile.displayUsername}</p>
					<p class="text-sm text-muted">Your username can't be changed.</p>
				</div>
				<TextField
					label="Display name"
					name="name"
					autocomplete="nickname"
					hint="How your friends will see you."
					value={valuesFor('profile').name ?? data.profile.name}
					error={profileErrors.name}
				/>
				<IconPicker
					name="avatarIcon"
					bind:value={avatar}
					options={data.avatars}
					label="Avatar"
					error={profileErrors.avatarIcon}
				/>
				<Button type="submit" class="self-start">Save profile</Button>
			</form>
		</section>

		<section aria-labelledby="settings-heading" class={sheet}>
			<form method="POST" action="?/settings" class={inner} use:enhance={focusResult(false)}>
				<h2 id="settings-heading" class={heading}>Settings</h2>
				{#if savedIn('settings')}{@render saved('Settings saved.')}{/if}
				<div class="flex flex-col gap-1.5">
					<label for="timezone" class="font-extrabold">Timezone</label>
					<select
						id="timezone"
						name="timezone"
						bind:value={timezone}
						aria-invalid={settingsErrors.timezone ? 'true' : undefined}
						aria-describedby={settingsErrors.timezone ? 'timezone-error' : undefined}
						class={select}
					>
						{#each data.timezones as zone (zone)}
							<option value={zone}>{zone.replaceAll('_', ' ')}</option>
						{/each}
					</select>
					{#if settingsErrors.timezone}
						<p id="timezone-error" class="text-sm font-bold text-ink">
							<Icon name="warning" />
							{settingsErrors.timezone}
						</p>
					{/if}
				</div>
				<div
					role="radiogroup"
					aria-labelledby="week-start-label"
					aria-invalid={settingsErrors.weekStartsOn ? 'true' : undefined}
					aria-describedby={['week-start-hint', settingsErrors.weekStartsOn && 'week-start-error']
						.filter(Boolean)
						.join(' ')}
					class="flex flex-col gap-1.5"
				>
					<span id="week-start-label" class="font-extrabold">Week starts on</span>
					<p id="week-start-hint" class="text-sm text-muted">Applies from your next card.</p>
					<div class="flex flex-wrap gap-3">
						{#each [{ value: 'monday', label: 'Monday' }, { value: 'sunday', label: 'Sunday' }] as option (option.value)}
							<label
								class="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 font-bold has-checked:border-forest has-checked:bg-earned-tile has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-forest"
							>
								<input
									type="radio"
									name="weekStartsOn"
									value={option.value}
									bind:group={weekStartsOn}
									class="size-4 accent-forest"
								/>
								{option.label}
							</label>
						{/each}
					</div>
					{#if settingsErrors.weekStartsOn}
						<p id="week-start-error" class="text-sm font-bold text-ink">
							<Icon name="warning" />
							{settingsErrors.weekStartsOn}
						</p>
					{/if}
				</div>
				<Button type="submit" class="self-start">Save settings</Button>
			</form>
		</section>
	</div>
	<div class="contents lg:flex lg:flex-col lg:gap-4">
		<section aria-labelledby="password-heading" class={sheet}>
			{#if data.methods.password}
				<form method="POST" action="?/changePassword" class={inner} use:enhance={focusResult(true)}>
					<h2 id="password-heading" class={heading}>Password</h2>
					{#if savedIn('password')}
						{@render saved('Password changed. Other devices are signed out.')}
					{/if}
					{@render problem(passwordErrors.form)}
					<TextField
						label="Current password"
						name="currentPassword"
						type="password"
						autocomplete="current-password"
						error={passwordErrors.currentPassword}
					/>
					<TextField
						label="New password"
						name="newPassword"
						type="password"
						autocomplete="new-password"
						hint="At least 10 characters. Changing it signs out your other devices."
						error={passwordErrors.newPassword}
					/>
					<Button type="submit" class="self-start">Change password</Button>
				</form>
			{:else}
				<form method="POST" action="?/setPassword" class={inner} use:enhance={focusResult(true)}>
					<h2 id="password-heading" class={heading}>Password</h2>
					{#if savedIn('password')}
						{@render saved('Password set. You can now sign in with your username.')}
					{/if}
					<p class="text-muted">Add a password so you can sign in with your username too.</p>
					<TextField
						label="New password"
						name="newPassword"
						type="password"
						autocomplete="new-password"
						hint="At least 10 characters."
						error={passwordErrors.newPassword}
					/>
					<Button type="submit" class="self-start">Set password</Button>
				</form>
			{/if}
		</section>

		{#if data.googleEnabled}
			<section aria-labelledby="methods-heading" class={sheet}>
				<div class={inner}>
					<h2 id="methods-heading" class={heading}>Google</h2>
					{#if savedIn('methods')}{@render saved('Google is unlinked.')}{/if}
					{@render problem(methodErrors.google ?? data.googleLinkError ?? undefined)}
					<p>
						<span class="font-extrabold">Password:</span>
						{data.methods.password ? 'set' : 'not set'}
					</p>
					<div class="flex flex-wrap items-center justify-between gap-3">
						<p>
							<span class="font-extrabold">Google:</span>
							{data.methods.google ? 'linked' : 'not linked'}
						</p>
						{#if data.methods.google}
							<form method="POST" action="?/unlinkGoogle" use:enhance={focusResult(false)}>
								<Button type="submit" variant="secondary">Unlink Google</Button>
							</form>
						{:else}
							<!-- Not enhanced: it leaves for Google's sign-in page. -->
							<form method="POST" action="?/linkGoogle">
								<Button type="submit" variant="secondary">Link Google</Button>
							</form>
						{/if}
					</div>
				</div>
			</section>
		{/if}

		<section aria-labelledby="everywhere-heading" class={sheet}>
			<form method="POST" action="?/signOutEverywhere" class={inner} use:enhance>
				<h2 id="everywhere-heading" class={heading}>Sessions</h2>
				<p class="text-muted">
					Lost a phone or used a shared computer? This signs you out on every device, including this
					one.
				</p>
				<Button type="submit" variant="secondary" class="self-start">Sign out everywhere</Button>
			</form>
		</section>

		<section class={sheet}>
			<form method="POST" action="/signout" class={inner}>
				<Button type="submit" variant="secondary" class="w-full">Sign out</Button>
			</form>
		</section>

		<section aria-labelledby="delete-heading" class={sheet}>
			<form method="POST" action="?/deleteAccount" class={inner} use:enhance={focusResult(true)}>
				<h2 id="delete-heading" class={heading}>Danger zone</h2>
				<p class="text-muted">
					This deletes your account and everything in it, for good. It can't be undone.
				</p>
				<TextField
					label="Type your username to confirm"
					name="confirmUsername"
					autocomplete="off"
					hint={`Your username is @${data.profile.displayUsername}.`}
					error={deleteErrors.confirmUsername}
				/>
				<Button
					type="submit"
					variant="secondary"
					class="self-start border-terracotta! bg-risk-tile!">Delete my account</Button
				>
			</form>
		</section>
	</div>
</div>
