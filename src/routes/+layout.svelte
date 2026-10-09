<script>
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';

	let { children } = $props();

	const links = [
		{ href: '/', label: '실시간 회화' },
		{ href: '/recorder', label: '녹음기' }
	];
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen bg-slate-100">
	<nav class="mx-auto flex max-w-2xl gap-1 px-4 pt-6">
		{#each links as link (link.href)}
			<a
				href={link.href}
				class="rounded-full px-4 py-1.5 text-sm font-medium transition {page.url.pathname === link.href
					? 'bg-slate-800 text-white'
					: 'text-slate-600 hover:bg-slate-200'}"
			>
				{link.label}
			</a>
		{/each}
	</nav>
	<main class="px-4 py-8">
		{@render children()}
	</main>
</div>
