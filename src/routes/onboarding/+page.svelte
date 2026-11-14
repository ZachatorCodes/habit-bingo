<script lang="ts">
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import Hero from '#lib/components/ui/Hero.svelte';
	import IconPicker from '#lib/components/ui/IconPicker.svelte';
	import Notice from '#lib/components/ui/Notice.svelte';
	import Seo from '#lib/components/ui/Seo.svelte';
	import TextField from '#lib/components/ui/TextField.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const errors = $derived(form?.errors ?? {});

	// The server defaults (UTC, Monday) apply without JavaScript; the browser knows better.
	let timezone = $state('UTC');
	let weekStartsOn = $state('monday');
	// svelte-ignore state_referenced_locally
	let avatar = $state(form?.values?.avatarIcon || data.avatarIcon);

	onMount(() => {
		timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
		const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
			weekInfo?: { firstDay: number };
			getWeekInfo?: () => { firstDay: number };
		};
		const firstDay = (locale.getWeekInfo?.() ?? locale.weekInfo)?.firstDay;
		weekStartsOn = firstDay === 7 ? 'sunday' : 'monday';
	});
</script>

<Seo
	title="Welcome"
	description="Finish setting up your Habit Bingo account."
	path="/onboarding"
	noindex
/>

<Hero title="Welcome to Habit Bingo" summary="A few quick things so your card feels like yours." />

<div class="relative -mt-[18px] pb-4">
	<section class="rounded-[24px] bg-surface shadow-sheet md:mx-auto md:max-w-[480px]">
		<form
			method="POST"
			class="mx-auto flex max-w-md flex-col gap-5 px-4 py-5"
			use:enhance={({ formElement }) =>
				async ({ update }) => {
					await update({ reset: false });
					formElement.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]')?.focus();
				}}
		>
			{#if errors.form || errors.timezone || errors.weekStartsOn}
				<Notice tone="error">{errors.form ?? errors.timezone ?? errors.weekStartsOn}</Notice>
			{/if}
			{#if data.needsUsername}
				<TextField
					label="Username"
					name="username"
					autocomplete="username"
					hint="3–20 letters, numbers or underscores."
					value={form?.values?.username}
					error={errors.username}
				/>
			{/if}
			<TextField
				label="Display name"
				name="name"
				autocomplete="nickname"
				hint="How your friends will see you."
				value={form?.values?.name ?? data.name}
				error={errors.name}
			/>
			<IconPicker
				name="avatarIcon"
				bind:value={avatar}
				options={data.avatars}
				label="Avatar"
				error={errors.avatarIcon}
			/>
			<input type="hidden" name="timezone" value={timezone} />
			<input type="hidden" name="weekStartsOn" value={weekStartsOn} />
			<Button type="submit" class="mt-2 w-full">Let's go</Button>
		</form>
	</section>
</div>
