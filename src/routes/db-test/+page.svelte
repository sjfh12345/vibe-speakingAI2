<!-- src/routes/db-test/+page.svelte -->
<script>
	import { enhance } from '$app/forms';

	let { data, form } = $props();
</script>

<svelte:head>
	<title>DB 통신 테스트</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<header>
		<h1 class="text-2xl font-bold text-slate-900">DB 통신 테스트</h1>
		<p class="mt-1 text-sm text-slate-500">
			Supabase <code>test_messages</code> 테이블에 읽기·쓰기·삭제를 시도합니다.
		</p>
	</header>

	<section class="rounded-xl bg-white p-4 shadow-sm">
		{#if data.loadError}
			<p class="text-sm font-medium text-red-600">❌ 연결/조회 실패: {data.loadError}</p>
		{:else}
			<p class="text-sm font-medium text-emerald-600">
				✅ 연결 성공 · {data.messages.length}건 조회 · {data.latencyMs}ms
			</p>
		{/if}
	</section>

	<form method="POST" action="?/create" use:enhance class="flex gap-2">
		<input
			name="content"
			placeholder="저장할 메시지"
			class="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
		/>
		<button class="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
			저장
		</button>
	</form>

	{#if form?.message}
		<p class="text-sm text-slate-600">{form.message}</p>
	{/if}

	<ul class="divide-y divide-slate-200 rounded-xl bg-white shadow-sm">
		{#each data.messages as msg (msg.id)}
			<li class="flex items-center justify-between gap-4 px-4 py-3">
				<div>
					<p class="text-sm text-slate-900">{msg.content}</p>
					<p class="text-xs text-slate-400">#{msg.id} · {new Date(msg.created_at).toLocaleString()}</p>
				</div>
				<form method="POST" action="?/delete" use:enhance>
					<input type="hidden" name="id" value={msg.id} />
					<button class="text-xs text-red-500 hover:underline">삭제</button>
				</form>
			</li>
		{:else}
			<li class="px-4 py-6 text-center text-sm text-slate-400">데이터가 없습니다.</li>
		{/each}
	</ul>
</div>
