<script>
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page } from '$app/state';

	let { data, children } = $props();

	const links = [
		{ href: '/', label: '실시간 회화' },
		{ href: '/history', label: '회화 기록' },
		{ href: '/recorder', label: '녹음기' },
		{ href: '/db-test', label: 'DB 테스트' }
	];
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen bg-slate-100">
	<nav class="mx-auto flex max-w-2xl flex-wrap items-center gap-1 px-4 pt-6">
		<!-- 기능 메뉴는 로그인해야 쓸 수 있으므로 로그아웃 상태에서는 숨긴다 -->
		{#each data.user ? links : [] as link (link.href)}
			<a
				href={link.href}
				class="rounded-full px-4 py-1.5 text-sm font-medium transition {page.url.pathname === link.href ||
				(link.href !== '/' && page.url.pathname.startsWith(`${link.href}/`))
					?'bg-slate-800 text-white'
					: 'text-slate-600 hover:bg-slate-200'}"
			>
				{link.label}
			</a>
		{/each}

		<div class="ml-auto flex items-center gap-2 text-sm">
			{#if data.user}
				<a
					href="/account"
					title={data.user.name ? `${data.user.name} (${data.user.email})` : data.user.email}
					class="rounded-full px-3 py-1.5 font-medium transition {page.url.pathname === '/account'
						? 'bg-slate-800 text-white'
						: 'text-slate-600 hover:bg-slate-200'}"
				>
					내 프로필
				</a>
				<form method="POST" action="/logout">
					<button class="rounded-full px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-200">
						로그아웃
					</button>
				</form>
			{:else}
				<a href="/login" class="rounded-full px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-200">로그인</a>
				<a href="/signup" class="rounded-full bg-slate-800 px-3 py-1.5 font-medium text-white hover:bg-slate-700">
					회원가입
				</a>
			{/if}
		</div>
	</nav>
	<main class="px-4 py-8">
		{@render children()}
	</main>
</div>
