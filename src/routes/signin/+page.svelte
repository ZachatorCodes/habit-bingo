<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '#lib/components/ui/Button.svelte';
	import Hero from '#lib/components/ui/Hero.svelte';
	import Notice from '#lib/components/ui/Notice.svelte';
	import Seo from '#lib/components/ui/Seo.svelte';
	import TextField from '#lib/components/ui/TextField.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const errors = $derived(form?.errors ?? {});
	// A password attempt's error replaces one Google sent back.
	const formError = $derived(errors.form ?? data.googleError);
</script>

<Seo
	title="Sign in"
	description="Sign in to Habit Bingo to check in on today's habits."
	path="/signin"
	noindex
/>

<Hero title="Welcome back" summary="Sign in to check in on today's habits." />

<div class="relative -mt-[18px] pb-4">
	<section class="rounded-[24px] bg-surface shadow-sheet md:mx-auto md:max-w-[480px]">
		<div class="mx-auto flex max-w-md flex-col gap-4 px-4 py-5">
			{#if data.googleEnabled}
				<form method="POST" action="?/google">
					<input type="hidden" name="next" value={data.next} />
					<Button type="submit" variant="secondary" class="w-full">Continue with Google</Button>
				</form>
				<p class="text-center font-bold text-muted">or</p>
			{/if}

			<form
				method="POST"
				action="?/signin"
				class="flex flex-col gap-4"
				use:enhance={({ formElement }) =>
					async ({ update }) => {
						await update();
						formElement
							.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]')
							?.focus();
					}}
			>
				<!-- The form action replaces the query string, so ?next= travels in the body. -->
				<input type="hidden" name="next" value={data.next} />
				{#if data.passwordUpdated && !formError}
					<Notice tone="success">Password updated. Sign in with your new password.</Notice>
				{/if}
				{#if formError}
					<Notice tone="error">{formError}</Notice>
				{/if}
				<TextField
					label="Username"
					name="username"
					autocomplete="username"
					value={form?.values?.username}
					error={errors.username}
				/>
				<TextField
					label="Password"
					name="password"
					type="password"
					autocomplete="current-password"
					error={errors.password}
				/>
				<Button type="submit" class="mt-2 w-full">Sign in</Button>
			</form>

			<p class="text-center text-muted">Forgot your password? Ask an admin for a reset link.</p>
		</div>
	</section>
</div>
