<script>
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { LiveSession } from '#lib/live/live-session.svelte.js';
	import {
		DEFAULT_TUTOR_SETTINGS,
		normalizeTutorSettings,
		normalizeCustomPrompt
	} from '#lib/live/tutor-prompt.js';
	import LiveDiagnostics from './LiveDiagnostics.svelte';
	import TutorSettings from './TutorSettings.svelte';

	/**
	 * @type {{
	 *   customPrompts?: { id: string, title: string, content: string }[],
	 *   customPromptsError?: string | null
	 * }}
	 */
	let { customPrompts = [], customPromptsError = null } = $props();

	const SETTINGS_KEY = 'tutor-settings';

	// 로그인한 경우에만 대화가 끝날 때 기록을 저장한다
	const session = new LiveSession({ canSave: () => Boolean(page.data.user) });

	let settings = $state({ ...DEFAULT_TUTOR_SETTINGS });
	/** 불러온 저장 프롬프트 id */
	let selectedPromptId = $state(/** @type {string | null} */ (null));
	let settingsLoaded = false;

	// 저장 프롬프트를 수정 없이 그대로 쓰는 경우에만 회화 기록에 연결한다
	const usedPromptId = $derived.by(() => {
		const p = customPrompts.find((c) => c.id === selectedPromptId);
		return p && normalizeCustomPrompt(p.content) === normalizeCustomPrompt(settings.customPrompt) ? p.id : null;
	});

	// 마지막으로 쓴 튜터 설정을 이 브라우저에 기억한다 (서버 렌더링과 어긋나지 않도록 마운트 후 읽음)
	$effect(() => {
		try {
			const saved = localStorage.getItem(SETTINGS_KEY);
			if (saved) {
				const value = JSON.parse(saved);
				// 이전 형식(설정만 저장)도 읽는다
				settings = normalizeTutorSettings(value.settings ?? value);
				selectedPromptId = typeof value.selectedPromptId === 'string' ? value.selectedPromptId : null;
			}
		} catch {
			// 저장소를 쓸 수 없거나 값이 깨졌으면 기본값 사용
		}
		settingsLoaded = true;
	});
	$effect(() => {
		const json = JSON.stringify({ settings, selectedPromptId });
		if (!settingsLoaded) return;
		try {
			localStorage.setItem(SETTINGS_KEY, json);
		} catch {
			// 사생활 보호 모드 등에서는 기억하지 않는다
		}
	});

	/** @type {HTMLDivElement | undefined} */
	let scroller = $state();

	// 새 자막이 오면 맨 아래로 스크롤
	$effect(() => {
		const last = session.messages.at(-1);
		void last?.text;
		tick().then(() => scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' }));
	});

	const history = $derived(session.history);

	// 다른 페이지로 이동하면 연결 정리 ($effect는 브라우저에서만 실행)
	$effect(() => () => session.disconnect('leave'));

	const statusLabel = $derived(
		session.status === 'connecting'
			? '연결 중…'
			: session.status === 'live'
				? session.aiSpeaking
					? 'AI가 말하는 중'
					: session.muted
						? '음소거됨'
						: '듣는 중 — 편하게 말해 보세요'
				: session.status === 'error'
					? '오류'
					: '대기'
	);
</script>

<!-- 탭을 닫거나 새로고침할 때는 $effect 정리가 실행되지 않으므로 여기서 대화를 마감·저장한다 -->
<svelte:window onpagehide={() => session.disconnect('leave')} />

<section class="mx-auto w-full max-w-2xl space-y-4">
	<div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
		<div class="flex flex-col items-center gap-5">
			<!-- 상태 오브 -->
			<div class="relative flex h-32 w-32 items-center justify-center">
				<div
					class="absolute inset-0 rounded-full transition-transform duration-75 {session.aiSpeaking
						? 'bg-indigo-200'
						: 'bg-emerald-100'}"
					style="transform: scale({session.status === 'live'
						? 1 + (session.aiSpeaking ? 0.15 : session.micLevel * 0.5)
						: 0.85})"
				></div>
				<div
					class="relative flex h-24 w-24 items-center justify-center rounded-full text-3xl font-bold text-white shadow-lg transition-colors {session.status ===
					'live'
						? session.aiSpeaking
							? 'bg-indigo-500'
							: 'bg-emerald-500'
						: session.status === 'error'
							? 'bg-red-400'
							: 'bg-slate-300'}"
				>
					{#if session.status === 'connecting'}
						<span class="h-8 w-8 animate-spin rounded-full border-4 border-white/40 border-t-white"></span>
					{:else}
						{session.aiSpeaking ? 'AI' : 'Me'}
					{/if}
				</div>
			</div>

			<div class="text-center">
				<p class="font-medium text-slate-700">{statusLabel}</p>
				{#if session.lastLatency !== null}
					<p class="mt-1 text-xs text-slate-500">
						응답 지연 <span class="font-mono tabular-nums">{session.lastLatency}ms</span>
						<span class="text-slate-400">(말 끝 → AI 첫 음성, VAD 대기 500ms 포함)</span>
					</p>
				{/if}
			</div>

			<div class="flex flex-wrap justify-center gap-3">
				{#if session.status === 'live'}
					<button
						onclick={() => session.toggleMute()}
						class="rounded-full border border-slate-300 px-5 py-3 font-medium text-slate-700 transition hover:bg-slate-50"
					>
						{session.muted ? '음소거 해제' : '음소거'}
					</button>
					<button
						onclick={() => session.disconnect()}
						class="rounded-full bg-slate-800 px-6 py-3 font-semibold text-white shadow transition hover:bg-slate-900"
					>
						대화 종료
					</button>
				{:else if session.status === 'connecting'}
					<button
						disabled
						class="rounded-full bg-emerald-500 px-8 py-3 font-semibold text-white opacity-60 shadow"
					>
						연결 중…
					</button>
					<button
						onclick={() => session.disconnect()}
						class="rounded-full border border-slate-300 px-5 py-3 font-medium text-slate-700 transition hover:bg-slate-50"
					>
						연결 취소
					</button>
				{:else}
					<button
						onclick={() => session.connect(normalizeTutorSettings(settings), usedPromptId)}
						class="rounded-full bg-emerald-500 px-8 py-3 font-semibold text-white shadow transition hover:bg-emerald-600"
					>
						대화 시작
					</button>
				{/if}
			</div>

			{#if session.status !== 'live'}
				<p class="text-xs text-slate-400">이어폰을 쓰면 AI 목소리가 마이크로 다시 들어가지 않아 더 자연스러워요.</p>
			{/if}
		</div>

		{#if session.error}
			<p class="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm break-words text-red-700">{session.error}</p>
		{/if}
		{#if session.notice}
			<p class="mt-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">{session.notice}</p>
		{/if}

		{#if history.state === 'recording'}
			<p class="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 px-4 py-2 text-sm text-slate-600">
				<span class="h-2 w-2 animate-pulse rounded-full bg-red-500"></span>
				이 대화는 회화 기록에 저장되고 있습니다.
			</p>
		{:else if history.state === 'saving'}
			<p class="mt-4 rounded-lg bg-slate-50 px-4 py-2 text-sm text-slate-600">회화 기록을 저장하는 중…</p>
		{:else if history.state === 'saved'}
			<p class="mt-4 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
				회화 기록을 저장했습니다.
				<a href="/history/{history.id}" class="ml-1 font-medium underline">방금 대화 보기</a>
			</p>
		{:else if history.state === 'skipped'}
			<p class="mt-4 rounded-lg bg-slate-50 px-4 py-2 text-sm text-slate-600">
				<a href="/login" class="font-medium underline">로그인</a>하면 회화 기록이 자동으로 저장됩니다.
			</p>
		{:else if history.state === 'error'}
			<p class="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm break-words text-red-700">
				회화 기록 저장 실패: {history.error}
				{#if history.id}<a href="/history/{history.id}" class="ml-1 font-medium underline">저장된 부분 보기</a>{/if}
			</p>
		{/if}
	</div>

	<TutorSettings
		bind:settings
		bind:selectedPromptId
		disabled={session.status === 'connecting' || session.status === 'live'}
		loggedIn={Boolean(page.data.user)}
		{customPrompts}
		{customPromptsError}
	/>

	<LiveDiagnostics {session} />

	<!-- 대화 자막 -->
	<div class="rounded-2xl border border-slate-200 bg-white shadow-sm">
		<h2 class="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">대화 자막</h2>
		<div bind:this={scroller} class="h-80 space-y-3 overflow-y-auto px-5 py-4">
			{#if session.messages.length === 0}
				<p class="pt-24 text-center text-sm text-slate-400">대화를 시작하면 자막이 여기에 표시됩니다.</p>
			{/if}
			{#each session.messages as m (m.id)}
				<div class="flex {m.role === 'user' ? 'justify-end' : 'justify-start'}">
					<p
						class="max-w-[80%] rounded-2xl px-4 py-2 text-sm leading-relaxed {m.role === 'user'
							? 'rounded-br-sm bg-emerald-500 text-white'
							: 'rounded-bl-sm bg-slate-100 text-slate-800'} {m.done ? '' : 'opacity-80'}"
					>
						{m.text}
						{#if m.interrupted}<span class="ml-1 text-xs opacity-60">(중단됨)</span>{/if}
					</p>
				</div>
			{/each}
		</div>
	</div>
</section>
