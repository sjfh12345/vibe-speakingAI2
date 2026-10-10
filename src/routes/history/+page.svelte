<!-- src/routes/history/+page.svelte -->
<script>
	import { formatDate, formatTime, formatDuration, formatSeconds, END_REASON_LABELS } from '#lib/format.js';
	import { describeTutorSettings } from '#lib/live/tutor-prompt.js';

	let { data } = $props();

	// 사용 날짜별로 묶는다 (이미 최신순으로 정렬되어 있음)
	const groups = $derived.by(() => {
		/** @type {{ date: string, items: typeof data.conversations }[]} */
		const result = [];
		for (const c of data.conversations) {
			const date = formatDate(c.started_at);
			const last = result.at(-1);
			if (last?.date === date) last.items.push(c);
			else result.push({ date, items: [c] });
		}
		return result;
	});
</script>

<svelte:head>
	<title>회화 기록</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<header>
		<h1 class="text-2xl font-bold text-slate-900">회화 기록</h1>
		<p class="mt-1 text-sm text-slate-500">AI 튜터와 나눈 대화가 사용한 시각 순으로 저장됩니다.</p>
	</header>

	<!-- 사용 기록 요약 -->
	<section class="grid grid-cols-2 gap-3">
		<div class="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
			<p class="text-xs text-slate-500">최근 7일</p>
			<p class="mt-1 text-xl font-bold text-slate-900 tabular-nums">{formatSeconds(data.usage.weekSec)}</p>
			<p class="text-xs text-slate-400">회화 {data.usage.weekCount}회</p>
		</div>
		<div class="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
			<p class="text-xs text-slate-500">전체</p>
			<p class="mt-1 text-xl font-bold text-slate-900 tabular-nums">{formatSeconds(data.usage.totalSec)}</p>
			<p class="text-xs text-slate-400">회화 {data.usage.totalCount}회</p>
		</div>
	</section>

	{#each groups as group (group.date)}
		<section class="space-y-2">
			<h2 class="px-1 text-sm font-semibold text-slate-600">{group.date}</h2>
			<ul class="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
				{#each group.items as c (c.id)}
					<li>
						<a href="/history/{c.id}" class="flex items-center gap-4 px-5 py-4 transition hover:bg-slate-50">
							<div class="w-24 shrink-0 font-mono text-sm text-slate-700 tabular-nums">
								{formatTime(c.started_at)}{#if c.ended_at}–{formatTime(c.ended_at)}{/if}
							</div>
							<div class="min-w-0 flex-1">
								<p class="truncate text-sm text-slate-900">{c.title ?? '(제목 없음)'}</p>
								{#if c.tutor_settings}
									<p class="mt-1 flex flex-wrap gap-1">
										{#each describeTutorSettings(c.tutor_settings) as item (item.key)}
											<span class="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600" title={item.label}>
												{item.key === 'koreanHelp' ? `한국어 도움 ${item.value}` : item.value}
											</span>
										{/each}
										{#if c.tutor_settings.customPrompt}
											<span
												class="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700"
												title={c.tutor_settings.customPrompt}
											>
												커스텀 프롬프트
											</span>
										{/if}
									</p>
								{/if}
								<p class="mt-0.5 text-xs text-slate-400">
									메시지 {c.messageCount}개
									{#if c.ended_at}
										· {formatDuration(c.started_at, c.ended_at)}
										{#if c.end_reason} · {END_REASON_LABELS[c.end_reason]}{/if}
									{:else}
										· <span class="text-amber-600">진행 중 또는 비정상 종료</span>
									{/if}
								</p>
							</div>
							<span class="text-slate-300" aria-hidden="true">›</span>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{:else}
		<div class="rounded-2xl border border-slate-200 bg-white px-5 py-12 text-center shadow-sm">
			<p class="text-sm text-slate-500">아직 저장된 회화가 없습니다.</p>
			<a
				href="/"
				class="mt-4 inline-block rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
			>
				대화 시작하기
			</a>
		</div>
	{/each}
</div>
