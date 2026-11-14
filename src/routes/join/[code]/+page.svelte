<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Button from '#lib/components/ui/Button.svelte';
	import Hero from '#lib/components/ui/Hero.svelte';
	import Notice from '#lib/components/ui/Notice.svelte';
	import ProgressRing from '#lib/components/ui/ProgressRing.svelte';
	import Seo from '#lib/components/ui/Seo.svelte';
	import TextField from '#lib/components/ui/TextField.svelte';
	import type { Snippet } from 'svelte';
	import type { PageProps } from './$types';

	let { data, form, params }: PageProps = $props();

	const deadInviteMessages = {
		expired: 'This invite has expired.',
		usedUp: 'This invite has already been used.',
		notFound: "We couldn't find that invite."
	};

	const errors = $derived(form?.errors ?? {});
</script>

<Seo
	title="Join Habit Bingo"
	description="You've been invited to Habit Bingo. Create your account to start your first card."
	path={`/join/${encodeURIComponent(params.code)}`}
	noindex
/>

{#snippet sheet(content: Snippet)}
	<div class="relative -mt-[18px] pb-4">
		<section class="rounded-[24px] bg-surface shadow-sheet md:mx-auto md:max-w-[480px]">
			<div class="mx-auto flex max-w-md flex-col gap-4 px-4 py-5">
				{@render content()}
			</div>
		</section>
	</div>
{/snippet}

{#if data.status === 'group'}
	{#if data.member}
		<Hero title={`You're already in ${data.group.name}.`} />
	{:else}
		<Hero
			title={`Join ${data.group.name}`}
			summary={`${data.memberCount} ${data.memberCount === 1 ? 'member' : 'members'}`}
		/>
	{/if}
	{#snippet groupSheet()}
		<div class="flex justify-center">
			<ProgressRing icon={data.group.icon} variant="open" size="lg" />
		</div>
		{#if data.member}
			<Button
				href={resolve('/(app)/groups/[id]', { id: data.group.id })}
				class="w-full wrap-anywhere">Open {data.group.name}</Button
			>
		{:else}
			{#if form?.message}
				<Notice tone="error">{form.message}</Notice>
			{/if}
			<form method="POST" action="?/join" use:enhance>
				<Button type="submit" class="w-full">Join</Button>
			</form>
		{/if}
	{/snippet}
	{@render sheet(groupSheet)}
{:else if data.status === 'valid'}
	<Hero
		title="You're invited to Habit Bingo"
		summary="Pick a username your friends will recognize."
	/>
	{#snippet validSheet()}
		{#if data.googleEnabled}
			<form method="POST" action="?/google">
				<Button type="submit" variant="secondary" class="w-full">Continue with Google</Button>
			</form>
			<p class="text-center font-bold text-muted">or</p>
		{/if}

		<form
			method="POST"
			action="?/signup"
			class="flex flex-col gap-4"
			use:enhance={({ formElement }) =>
				async ({ update }) => {
					await update();
					formElement.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]')?.focus();
				}}
		>
			{#if errors.form}
				<Notice tone="error">{errors.form}</Notice>
			{/if}
			<TextField
				label="Username"
				name="username"
				autocomplete="username"
				hint="3–20 letters, numbers or underscores."
				value={form?.values?.username}
				error={errors.username}
			/>
			<TextField
				label="Display name"
				name="name"
				autocomplete="nickname"
				hint="How your friends will see you."
				value={form?.values?.name}
				error={errors.name}
			/>
			<TextField
				label="Password"
				name="password"
				type="password"
				autocomplete="new-password"
				hint="At least 10 characters."
				error={errors.password}
			/>
			<Button type="submit" class="mt-2 w-full">Create account</Button>
		</form>

		<p class="text-center text-muted">
			Already have an account?
			<!-- eslint-disable svelte/no-navigation-without-resolve -- resolve() cannot carry the ?next= query -->
			<a
				class="font-bold underline"
				href={`/signin?next=${encodeURIComponent(`/join/${params.code}`)}`}>Sign in</a
			>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</p>
	{/snippet}
	{@render sheet(validSheet)}
{:else}
	<Hero title={data.status === 'groupDead' ? data.message : deadInviteMessages[data.status]} />
	{#snippet deadSheet()}
		<div class="flex justify-center">
			<ProgressRing icon="envelope" variant="open" size="lg" />
		</div>
		<p class="text-center text-muted">Ask the friend who invited you for a fresh link.</p>
		<Button href={resolve('/')} variant="secondary" class="w-full">Go to the home page</Button>
	{/snippet}
	{@render sheet(deadSheet)}
{/if}
