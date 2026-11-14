<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import Button from '#lib/components/ui/Button.svelte';
	import Hero from '#lib/components/ui/Hero.svelte';
	import Seo from '#lib/components/ui/Seo.svelte';
	import IconPicker from '#lib/components/ui/IconPicker.svelte';
	import TextField from '#lib/components/ui/TextField.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	// svelte-ignore state_referenced_locally
	let icon = $state(form?.values?.icon || data.group.icon);
	const errors = $derived<Record<string, string>>(form?.errors ?? {});
	const back = $derived(resolve('/(app)/groups/[id]', { id: data.group.id }));
</script>

<Seo
	title="Edit group"
	description="Rename a Habit Bingo group."
	path={`/groups/${data.group.id}/edit`}
	noindex
/>

<Hero title="Edit group" summary="Change the group's name and icon." />

<section class="relative -mt-[18px] rounded-[24px] bg-surface shadow-sheet">
	<div class="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-5">
		<!-- eslint-disable svelte/no-navigation-without-resolve -- resolve() cannot carry the query string -->
		<a
			href={`${back}?tab=members`}
			class="inline-flex min-h-11 items-center gap-1 font-bold text-forest underline-offset-4 hover:underline"
			><Icon name="arrow-left" /> {data.group.name}</a
		>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->

		<form
			method="POST"
			novalidate
			class="flex flex-col gap-5"
			use:enhance={({ formElement }) =>
				async ({ update }) => {
					await update({ reset: false });
					formElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
				}}
		>
			<TextField
				label="Name"
				name="name"
				value={form?.values?.name ?? data.group.name}
				error={errors.name}
			/>
			<IconPicker name="icon" groups bind:value={icon} error={errors.icon} />
			<Button type="submit" class="w-full">Save changes</Button>
		</form>
	</div>
</section>
