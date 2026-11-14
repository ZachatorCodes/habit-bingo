<script lang="ts">
	import type { TodayRowData, TodayRowView } from '#lib/game/types.ts';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { tick, type Snippet } from 'svelte';
	import { prefersReducedMotion, Spring } from 'svelte/motion';
	import { burst, tap } from '#lib/components/card/celebrate.ts';
	import Check from 'phosphor-svelte/lib/Check';
	import Plus from 'phosphor-svelte/lib/Plus';
	import BingoSquare from './BingoSquare.svelte';

	type Props = {
		row: TodayRowData;
		/** The day being logged (YYYY-MM-DD). */
		day: string;
		/** The page's own query (e.g. "&day=2026-10-19"), carried through the form actions. */
		keep: string;
		/** Called with a message when the server refuses a check-in or can't be reached. */
		onerror?: (message: string) => void;
		/** Called when the name is clicked; the page may open the habit sheet in place. */
		onopen?: (event: MouseEvent, href: string) => void;
	};

	let { row, day, keep, onerror, onopen }: Props = $props();

	/** What the row shows while a check-in is on its way; null shows the server's row. */
	const href = $derived(resolve('/(app)/card/squares/[id]', { id: row.squareId }));
	let pending = $state<TodayRowView | null>(null);
	/** True from submit until the server answers; stops a double tap logging twice. */
	let busy = $state(false);
	const view = $derived(pending ?? row);
	const scale = new Spring(1, { stiffness: 0.3, damping: 0.4 });
	// The row's main button: + normally, the check once the day's target is met.
	// Found by attribute: two branches binding one ref would race when one swaps for the other.
	let li = $state<HTMLLIElement>();

	/** Pop & burst (spec §4.7), then an optimistic update that rolls back if the server refuses. */
	// `next` is read when the form is submitted: enhance keeps the callback it was mounted with, so
	// reading the row then (not at mount) keeps the view in step with the latest data.
	function optimistic(next: () => TodayRowView | null, celebrate: boolean): SubmitFunction {
		return ({ submitter, cancel }) => {
			// Only + is guarded: an undo right after a log is legitimate.
			if (celebrate) {
				if (busy) return cancel();
				busy = true;
			}
			// A button that goes away (− at zero, + once met, the check on undo) hands focus to the row's main button.
			const hadFocus = submitter === document.activeElement;
			const view = next();
			if (view) pending = view;
			if (celebrate) {
				tap();
				if (!prefersReducedMotion.current) {
					scale.set(0.85, { instant: true });
					scale.target = 1;
				}
				const box = submitter?.getBoundingClientRect();
				if (box) {
					void burst(
						{
							x: (box.left + box.width / 2) / window.innerWidth,
							y: (box.top + box.height / 2) / window.innerHeight
						},
						prefersReducedMotion.current
					);
				}
			}
			return async ({ result, update }) => {
				if (result.type === 'failure' || result.type === 'error') {
					pending = null;
					busy = false;
					const message =
						result.type === 'failure' && typeof result.data?.message === 'string'
							? result.data.message
							: "Couldn't save that. Try again.";
					onerror?.(message);
					return;
				}
				// The action redirects back to this same day (so a no-JS refresh never re-posts). With
				// JavaScript, reload the data in place instead of following it, so the page keeps its
				// scroll position and focus.
				if (result.type === 'redirect') await invalidateAll();
				else await update();
				pending = null;
				busy = false;
				if (hadFocus && !submitter?.isConnected) {
					await tick();
					li?.querySelector<HTMLElement>('[data-primary]')?.focus();
				}
			};
		};
	}

	// The day's target is met: the check is the undo action.
	const met = $derived(view.count > 0 && view.state === 'complete');
	const button =
		'grid size-11 shrink-0 place-items-center rounded-full text-xl font-bold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink';
</script>

<li bind:this={li} class="flex items-center gap-3 py-3">
	<div
		class={['w-14 shrink-0', prefersReducedMotion.current && 'transition-opacity duration-200']}
		style:transform="scale({scale.current})"
		style:opacity={prefersReducedMotion.current && pending ? 0.6 : 1}
	>
		<BingoSquare
			icon={row.icon}
			label={row.name}
			state={view.state}
			progress={view.progress}
			showLabel={false}
		/>
	</div>
	<div class="min-w-0 flex-1">
		<p class="truncate text-[14.5px] font-bold">
			<a
				{href}
				onclick={(event) => onopen?.(event, href)}
				class="focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink"
				>{row.name}</a
			>
		</p>
		<p class="text-xs font-semibold text-muted">{view.text}</p>
	</div>
	{#snippet undo(cls: string, ref: boolean, icon: Snippet)}
		<form
			method="POST"
			action={`?/unlog${keep}`}
			use:enhance={optimistic(() => row.ifUndone, false)}
		>
			<input type="hidden" name="squareId" value={row.squareId} />
			<input type="hidden" name="date" value={day} />
			{#if ref}
				<button type="submit" data-primary aria-label="Undo one {row.name}" class={[button, cls]}
					>{@render icon()}</button
				>
			{:else}
				<button type="submit" aria-label="Undo one {row.name}" class={[button, cls]}
					>{@render icon()}</button
				>
			{/if}
		</form>
	{/snippet}
	{#snippet checkIcon()}<Check weight="bold" aria-hidden="true" />{/snippet}
	{#snippet minusIcon()}−{/snippet}
	{#if met}
		{@render undo('bg-earned-tile text-forest', true, checkIcon)}
	{:else}
		{#if view.count > 0}
			{@render undo('bg-page text-muted', false, minusIcon)}
		{/if}
		<form method="POST" action={`?/log${keep}`} use:enhance={optimistic(() => row.ifLogged, true)}>
			<input type="hidden" name="squareId" value={row.squareId} />
			<input type="hidden" name="date" value={day} />
			<button
				type="submit"
				data-primary
				aria-label="Log {row.name}"
				aria-busy={busy}
				aria-disabled={busy}
				class={[button, 'bg-terracotta text-white', busy && 'opacity-70 motion-safe:scale-95']}
				><Plus weight="bold" aria-hidden="true" /></button
			>
		</form>
	{/if}
</li>
