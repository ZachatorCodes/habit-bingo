<script lang="ts">
	import Hero from '#lib/components/ui/Hero.svelte';
	import Seo from '#lib/components/ui/Seo.svelte';
</script>

<Seo
	title="Privacy"
	description="What Habit Bingo stores about you, why, and how to delete it."
	path="/privacy"
/>

<Hero title="Privacy" />

<article
	class="relative mx-auto -mt-[18px] mb-8 w-[calc(100%-2rem)] max-w-2xl rounded-sheet bg-surface p-5 leading-relaxed text-ink shadow-sheet md:max-w-[720px]"
>
	<p class="text-sm text-muted">Last updated October 9, 2026</p>

	<h2 class="mt-8 text-[22px] font-extrabold">What we store</h2>
	<ul class="mt-2 list-disc space-y-1 pl-5">
		<li>Your account: username, display name, avatar, timezone, and how you sign in.</li>
		<li>
			If you sign in with Google: your Google account ID and email address. If you connect Google
			Calendar, the access tokens needed to manage the Habit Bingo calendar, stored encrypted.
		</li>
		<li>Your habits, bingo cards, check-ins, rewards, groups, and reactions.</li>
	</ul>

	<h2 class="mt-8 text-[22px] font-extrabold">Cookies</h2>
	<p class="mt-2">
		We only use essential cookies: the one that keeps you signed in. There are no advertising or
		tracking cookies.
	</p>

	<h2 class="mt-8 text-[22px] font-extrabold">Analytics</h2>
	<p class="mt-2">
		We use Vercel Web Analytics, which counts page views without cookies and without identifying
		you.
	</p>

	<h2 class="mt-8 text-[22px] font-extrabold">Who can see your data</h2>
	<p class="mt-2">
		People who share a group with you can see your card and highlights, except habits you mark
		private. We never sell your data.
	</p>

	<h2 class="mt-8 text-[22px] font-extrabold">Deleting your data</h2>
	<p class="mt-2">
		Delete your account from Me → Delete account and everything about you is removed.
	</p>

	<h2 class="mt-8 text-[22px] font-extrabold">Contact</h2>
	<p class="mt-2">
		Questions? Email <a class="underline" href="mailto:zachatorcodes@gmail.com"
			>zachatorcodes@gmail.com</a
		>.
	</p>
</article>
