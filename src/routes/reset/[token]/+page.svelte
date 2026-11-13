<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Button from '#lib/components/ui/Button.svelte';
	import Hero from '#lib/components/ui/Hero.svelte';
	import Notice from '#lib/components/ui/Notice.svelte';
	import ProgressRing from '#lib/components/ui/ProgressRing.svelte';
	import Seo from '#lib/components/ui/Seo.svelte';
	import TextField from '#lib/components/ui/TextField.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const problems = {
		expired: 'This reset link has expired.',
		used: 'This reset link has already been used.',
		notFound: "We couldn't find that reset link."
	};

	// A link that died while the form was open (used elsewhere, or expired) wins over the load.
	const status = $derived(form && 'status' in form && form.status ? form.status : data.status);
	const errors = $derived<Record<string, string>>(
		(form && 'errors' in form ? form.errors : undefined) ?? {}
	);
</script>

<svelte:head>
	<meta name="referrer" content="strict-origin" />
</svelte:head>

<!-- The token stays out of the canonical URL. -->
<Seo
	title="Reset your password"
	description="Set a new password for your Habit Bingo account."
	path="/reset"
	noindex
/>

{#if status === 'valid'}
	<Hero
		title="Choose a new password"
		summary="This signs you out on every device. Then sign in with the new password."
	/>
	<div class="relative -mt-[18px] pb-4">
		<section class="rounded-[24px] bg-surface shadow-sheet md:mx-auto md:max-w-[480px]">
			<form
				method="POST"
				class="mx-auto flex max-w-md flex-col gap-4 px-4 py-5"
				use:enhance={({ formElement }) =>
					async ({ update }) => {
						await update();
						formElement
							.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]')
							?.focus();
					}}
			>
				{#if errors.form}
					<Notice tone="error">{errors.form}</Notice>
				{/if}
				{#if data.username}
					<!-- For password managers: saves the new password against this account. -->
					<input
						type="text"
						name="username"
						autocomplete="username"
						value={data.username}
						readonly
						hidden
					/>
				{/if}
				<TextField
					label="New password"
					name="newPassword"
					type="password"
					autocomplete="new-password"
					hint="At least 10 characters."
					error={errors.newPassword}
				/>
				<Button type="submit" class="mt-2 w-full">Set new password</Button>
			</form>
		</section>
	</div>
{:else}
	<Hero title={problems[status]} />
	<div class="relative -mt-[18px] pb-4">
		<section class="rounded-[24px] bg-surface shadow-sheet md:mx-auto md:max-w-[480px]">
			<div class="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-6 text-center">
				<ProgressRing icon="lock" variant="open" size="lg" />
				<p class="text-muted">Ask an admin for a fresh link.</p>
				<Button href={resolve('/signin')} variant="secondary">Go to sign in</Button>
			</div>
		</section>
	</div>
{/if}
