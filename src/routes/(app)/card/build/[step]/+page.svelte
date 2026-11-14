<script lang="ts">
	import Icon from '#lib/components/ui/Icon.svelte';
	import { enhance } from '$app/forms';
	import BuilderSteps from '#lib/components/builder/BuilderSteps.svelte';
	import Button from '#lib/components/ui/Button.svelte';
	import CardBoard from '#lib/components/card/CardBoard.svelte';
	import Hero from '#lib/components/ui/Hero.svelte';
	import HabitForm from '#lib/components/habits/HabitForm.svelte';
	import HabitPicker from '#lib/components/builder/HabitPicker.svelte';
	import TargetList from '#lib/components/builder/TargetList.svelte';
	import TextField from '#lib/components/ui/TextField.svelte';
	import SizePicker from '#lib/components/builder/SizePicker.svelte';
	import { page } from '$app/state';
	import Seo from '#lib/components/ui/Seo.svelte';
	import type { SquareState } from '#lib/game/square-state.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const message = $derived(form && 'message' in form ? form.message : data.notice);
	const createForm = $derived(form && 'errors' in form ? form : null);
	// svelte-ignore state_referenced_locally
	let picked = $state<string[]>(
		(form && 'selected' in form ? form.selected : undefined) ??
			// A habit archived after it was picked is no longer a choice.
			data.draft.habitIds.filter((id) => data.habits.some((h) => h.id === id))
	);
	let creating = $state(false);

	/** The wide preview: picks in pick order, then placeholders, with the free centre in place. */
	const preview = $derived.by(() => {
		const size = data.draft.size;
		if (!size || data.need === null) return null;
		const chosen = picked.flatMap((id) => data.habits.find((h) => h.id === id) ?? []);
		const squares = Array.from<unknown, { icon: string; name: string; state: SquareState }>(
			{ length: data.need },
			(_, i) => {
				const habit = chosen[i];
				return habit
					? { icon: habit.icon, name: habit.name, state: 'empty' as const }
					: { icon: 'star', name: 'Empty', state: 'empty' as const };
			}
		);
		const centre = Math.floor((size * size) / 2);
		squares.splice(centre, 0, { icon: 'star', name: 'Free', state: 'free' });
		return { size, squares };
	});

	const targetForm = $derived(form && 'targetValues' in form ? form : null);
	const rewardForm = $derived(form && 'rewardValues' in form ? form : null);
	/** The target rows, showing what was typed after a refused submit. */
	const targetRows = $derived(
		(data.targets?.rows ?? []).map((row) => ({
			...row,
			value: targetForm?.targetValues?.[`target:${row.habit.id}`] ?? row.value
		}))
	);
	const rewardErrors = $derived<Record<string, string>>(rewardForm?.errors ?? {});
	const rewardValues = $derived(rewardForm?.rewardValues ?? data.draft.rewards);

	/** Keeps what was typed after a refused submit, then moves focus to the first problem. */
	function focusFirstError(formElement: HTMLFormElement) {
		return async ({ update }: { update: (options?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			formElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
		};
	}

	/** Stays on the Habits step: the new habit is added to the picks without losing the rest. */
	function trackCreated(formElement: HTMLFormElement) {
		return async ({
			result,
			update
		}: {
			result: { type: string; data?: Record<string, unknown> };
			update: (options?: { reset?: boolean }) => Promise<void>;
		}) => {
			await update({ reset: false });
			const created = result.type === 'success' ? result.data?.createdHabitId : null;
			if (typeof created === 'string') {
				picked = [...picked, created];
				creating = false;
			} else {
				formElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
			}
		};
	}
</script>

<Seo
	title="Build your card"
	description="Your Habit Bingo card and check-ins."
	path={page.url.pathname}
	noindex
/>

<Hero
	title={data.forNext
		? `Your ${data.monthName} card · starts ${data.monthName} 1`
		: `${data.draft.cardId ? 'Edit' : 'Build'} your ${data.monthName} card`}
	summary={data.forNext
		? `It starts on ${data.monthName} 1, and you can change it until the end of ${data.monthName} 2.`
		: 'Your progress is saved as you go.'}
>
	<BuilderSteps
		steps={data.steps}
		current={data.step}
		completed={data.draft.completed}
		forNext={data.forNext}
	/>
</Hero>

<section class="relative -mt-[18px] flex flex-col rounded-[24px] bg-surface shadow-sheet">
	<div
		class={[
			'mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6',
			data.step === 'habits' ? 'lg:max-w-5xl' : 'md:max-w-[640px]'
		]}
	>
		{#if message}
			<p id="step-error" role="alert" class="rounded-xl bg-risk-tile px-4 py-3 font-bold text-ink">
				<Icon name="warning" />
				{message}
			</p>
		{/if}

		{#if data.step === 'size'}
			<form method="POST" action={`?/size${data.keep}`} use:enhance class="flex flex-col gap-6">
				<SizePicker
					selected={data.draft.size}
					habitCount={data.habits.length}
					errorId={message ? 'step-error' : undefined}
				/>
				<div><Button type="submit">Continue</Button></div>
			</form>
		{:else if data.step === 'habits'}
			<div class="flex flex-col gap-6 lg:grid lg:grid-cols-[1fr_380px] lg:items-start lg:gap-8">
				<div class="flex flex-col gap-6">
					<div>
						<h2 class="text-2xl font-extrabold">Pick your habits</h2>
						<p class="mt-1 text-muted">
							Choose {data.need} for {data.monthName}. You can change their targets next.
						</p>
					</div>

					<details bind:open={creating} class="rounded-2xl border border-line bg-surface p-4">
						<summary
							class="group flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-xl font-extrabold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink [&::-webkit-details-marker]:hidden"
							><Icon
								name="caret-right"
								class="group-open:rotate-90 motion-safe:transition-transform"
							/>New habit</summary
						>
						<!-- novalidate: the server validates every field, as on the habit library's own form. -->
						<form
							method="POST"
							action={`?/createHabit${data.keep}`}
							novalidate
							class="mt-4"
							use:enhance={({ formElement }) => trackCreated(formElement)}
						>
							{#key createForm?.values ?? data.values}
								<HabitForm
									values={createForm?.values ?? data.values}
									errors={createForm?.errors ?? {}}
									submitLabel="Add habit"
								/>
							{/key}
						</form>
					</details>

					<form
						method="POST"
						action={`?/habits${data.keep}`}
						use:enhance={() =>
							async ({ update }) =>
								update({ reset: false })}
						class="flex flex-col gap-6"
					>
						{#if data.habits.length === 0}
							<p class="rounded-2xl border border-dashed border-line bg-surface p-4 font-bold">
								You have no habits yet. Add one above.
							</p>
						{:else if data.need !== null}
							<HabitPicker
								habits={data.habits}
								bind:selected={picked}
								need={data.need}
								errorId={message ? 'step-error' : undefined}
							/>
						{/if}
						<div><Button type="submit">Continue</Button></div>
					</form>
				</div>
				<!-- The card taking shape beside the picker on wide screens. -->
				{#if preview}
					<section aria-label="Preview" class="hidden lg:sticky lg:top-4 lg:block">
						<CardBoard size={preview.size} squares={preview.squares} />
					</section>
				{/if}
			</div>
		{:else if data.step === 'targets' && data.targets}
			<!-- novalidate: the server explains every out-of-range number on its own row. -->
			<form
				method="POST"
				action={`?/targets${data.keep}`}
				novalidate
				use:enhance={({ formElement }) => focusFirstError(formElement)}
				class="flex flex-col gap-6"
			>
				<TargetList
					rows={targetRows}
					daysLeft={data.forNext ? null : data.targets.daysLeft}
					monthName={data.monthName}
					startDate={data.targets.startDate}
					errors={targetForm?.targetErrors ?? {}}
				/>
				<div><Button type="submit">Continue</Button></div>
			</form>
		{:else if data.step === 'rewards'}
			<div>
				<h2 class="text-2xl font-extrabold">Pick your rewards</h2>
				<p class="mt-1 text-muted">Three treats to work toward.</p>
			</div>
			<form
				method="POST"
				action={`?/rewards${data.keep}`}
				novalidate
				use:enhance={({ formElement }) => focusFirstError(formElement)}
				class="flex flex-col gap-6"
			>
				<TextField
					label="First bingo"
					name="bingo"
					value={rewardValues.bingo}
					hint="What will you treat yourself to?"
					error={rewardErrors.bingo}
				/>
				<TextField
					label="{data.sixtyThreshold} squares"
					name="sixty"
					value={rewardValues.sixty}
					hint="What will you treat yourself to?"
					error={rewardErrors.sixty}
				/>
				<TextField
					label="Blackout"
					name="blackout"
					value={rewardValues.blackout}
					hint="What will you treat yourself to?"
					error={rewardErrors.blackout}
				/>
				<div><Button type="submit">Continue</Button></div>
			</form>
		{:else if data.step === 'board' && data.board}
			<div>
				<h2 class="text-2xl font-extrabold">Your board</h2>
				<p class="mt-1 text-muted">
					You can change habits, targets, rewards and the board for 48 hours after you start.
				</p>
			</div>
			<CardBoard size={data.board.size} squares={data.board.squares} />
			<div class="flex flex-wrap gap-3">
				<form method="POST" action={`?/shuffle${data.keep}`} use:enhance>
					<Button type="submit" variant="secondary">Shuffle again</Button>
				</form>
				<form method="POST" action={`?/start${data.keep}`} use:enhance>
					<Button type="submit">{data.draft.cardId ? 'Save changes' : 'Start card'}</Button>
				</form>
			</div>
		{/if}

		{#if data.draft.cardId}
			<form method="POST" action={`?/discard${data.keep}`} use:enhance>
				<Button type="submit" variant="secondary">Cancel editing</Button>
			</form>
		{:else if data.draft.completed.length > 0}
			<form method="POST" action={`?/discard${data.keep}`} use:enhance>
				<Button type="submit" variant="secondary">Start over</Button>
			</form>
		{/if}
	</div>
</section>
