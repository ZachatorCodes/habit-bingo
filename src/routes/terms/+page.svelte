<script lang="ts">
	import { resolve } from '$app/paths';
	import Hero from '#lib/components/ui/Hero.svelte';
	import Seo from '#lib/components/ui/Seo.svelte';
</script>

<Seo
	title="Terms"
	description="The terms for using Habit Bingo during its invite-only beta."
	path="/terms"
/>

<Hero title="Terms" />

<article
	class="relative mx-auto -mt-[18px] mb-8 w-[calc(100%-2rem)] max-w-2xl rounded-sheet bg-surface p-5 leading-relaxed text-ink shadow-sheet md:max-w-[720px]"
>
	<p class="text-sm text-muted">Last updated October 9, 2026</p>

	<h2 class="mt-8 text-[22px] font-extrabold">Invite-only beta</h2>
	<p class="mt-2">
		Habit Bingo is an invite-only beta built for a small group of friends. Features may change, and
		data may occasionally be reset while the app is in beta.
	</p>

	<h2 class="mt-8 text-[22px] font-extrabold">Acceptable use</h2>
	<p class="mt-2">
		Be kind in group names, rewards and reactions. Don't try to access other people's accounts,
		interfere with the service, or use it for anything unlawful. We may remove accounts that do.
	</p>

	<h2 class="mt-8 text-[22px] font-extrabold">No warranty</h2>
	<p class="mt-2">
		The app is provided as is, without warranties of any kind. It is a habit game, not medical,
		financial or professional advice.
	</p>

	<h2 class="mt-8 text-[22px] font-extrabold">Your account</h2>
	<p class="mt-2">
		You can delete your account at any time from Me → Delete account. See the
		<a class="underline" href={resolve('/privacy')}>privacy page</a> for what we store.
	</p>
</article>
