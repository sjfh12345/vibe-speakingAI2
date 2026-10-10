<!-- src/routes/history/[id]/+page.svelte -->
<script>
	import { enhance } from '$app/forms';
	import { formatDate, formatTime, formatDuration, END_REASON_LABELS } from '#lib/format.js';
	import { describeTutorSettings, normalizeCustomPrompt } from '#lib/live/tutor-prompt.js';

	let { data, form } = $props();

	const c = $derived(data.conversation);
	const chatCount = $derived(data.messages.filter((m) => m.role !== 'system').length);
	// 종료 기록이 없으면(비정상 종료) 마지막으로 저장된 메시지 시각까지를 사용 시간으로 본다
	const lastSavedAt = $derived(data.messages.at(-1)?.created_at ?? null);
	// 대화 당시의 커스텀 프롬프트 내용 (저장 프롬프트를 나중에 고쳐도 당시 내용이 보인다)
	const customPrompt = $derived(normalizeCustomPrompt(c.tutor_settings?.customPrompt));
</script>

<svelte:head>
	<title>회화 기록 · {formatDate(data.conversation.started_at)}</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-4">
	<a href="/history" class="inline-block text-sm text-slate-500 hover:text-slate-800">‹ 회화 기록 목록</a>

	<header class="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
		<div class="flex items-start justify-between gap-4">
			<div class="min-w-0">
				<h1 class="text-lg font-bold text-slate-900">{formatDate(c.started_at)}</h1>
				<p class="mt-1 font-mono text-sm text-slate-600 tabular-nums">
					{formatTime(c.started_at)}{#if c.ended_at}
						– {formatTime(c.ended_at)}
						<span class="font-sans text-slate-400">({formatDuration(c.started_at, c.ended_at)})</span>
					{:else if lastSavedAt}
						– {formatTime(lastSavedAt)}
						<span class="font-sans text-slate-400">(마지막 저장 기준)</span>
					{/if}
				</p>
				<p class="mt-1 text-xs text-slate-400">
					대화 {chatCount}개
					· {c.ended_at ? (END_REASON_LABELS[c.end_reason ?? ''] ?? '종료') : '진행 중 또는 비정상 종료'}
					{#if c.model}· <span class="font-mono">{c.model}</span>{/if}
				</p>
			</div>
			<form
				method="POST"
				action="?/delete"
				use:enhance={({ cancel }) => {
					if (!confirm('이 회화 기록을 삭제할까요? 되돌릴 수 없습니다.')) cancel();
				}}
			>
				<button class="rounded-full px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50">삭제</button>
			</form>
		</div>
		{#if form?.message}
			<p class="mt-3 text-sm text-red-600">{form.message}</p>
		{/if}

		<!-- 이 대화에 사용한 AI(튜터) 설정 -->
		<section class="mt-4 border-t border-slate-100 pt-3">
			<h2 class="mb-2 text-xs font-semibold text-slate-600">AI 튜터 설정</h2>
			{#if c.tutor_settings}
				<dl class="grid grid-cols-2 gap-2 sm:grid-cols-4">
					{#each describeTutorSettings(c.tutor_settings) as item (item.key)}
						<div class="rounded-lg bg-slate-50 px-3 py-2">
							<dt class="text-[11px] text-slate-500">{item.label}</dt>
							<dd class="mt-0.5 text-sm font-medium break-words text-slate-800">{item.value}</dd>
						</div>
					{/each}
				</dl>
				{#if customPrompt}
					<div class="mt-2 rounded-lg bg-slate-50 px-3 py-2">
						<p class="text-[11px] text-slate-500">
							커스텀 프롬프트
							{#if c.custom_prompt}
								· 저장 프롬프트 <span class="font-medium text-slate-700">'{c.custom_prompt.title}'</span> 사용
							{:else}
								· 직접 입력 (저장 안 함 또는 삭제됨)
							{/if}
						</p>
						<p class="mt-0.5 text-sm whitespace-pre-line text-slate-800">{customPrompt}</p>
					</div>
				{/if}
			{:else}
				<p class="text-xs text-slate-400">설정 기능을 추가하기 전의 기록이라 저장된 설정이 없습니다 (기본 설정으로 대화).</p>
			{/if}
		</section>

		{#if c.system_prompt}
			<details class="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
				<summary class="cursor-pointer font-medium text-slate-700">실제로 전달된 튜터 지시문 (시스템 프롬프트)</summary>
				<pre class="mt-2 font-sans leading-relaxed whitespace-pre-wrap">{c.system_prompt}</pre>
			</details>
		{/if}
	</header>

	<div class="space-y-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
		<p class="text-center text-xs text-slate-400">{formatTime(c.started_at)} 대화 시작</p>
		{#each data.messages as m (m.seq)}
			{#if m.role === 'system'}
				<p class="text-center text-xs text-slate-400">
					<span class="font-mono tabular-nums">{formatTime(m.created_at)}</span>
					{m.content}
				</p>
			{:else}
				<div class="flex {m.role === 'user' ? 'justify-end' : 'justify-start'}">
					<p
						class="max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed {m.role === 'user'
							? 'rounded-br-sm bg-emerald-500 text-white'
							: 'rounded-bl-sm bg-slate-100 text-slate-800'}"
					>
						{m.content}
						{#if m.interrupted}<span class="ml-1 text-xs opacity-60">(중단됨)</span>{/if}
					</p>
				</div>
			{/if}
		{:else}
			<p class="py-8 text-center text-sm text-slate-400">저장된 메시지가 없습니다.</p>
		{/each}
	</div>
</div>
