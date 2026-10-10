<!-- src/lib/components/TutorSettings.svelte -->
<script>
	import { enhance } from '$app/forms';
	import {
		TUTOR_LEVELS,
		CORRECTION_STYLES,
		TOPIC_SUGGESTIONS,
		TOPIC_MAX_LENGTH,
		CUSTOM_PROMPT_MAX_LENGTH,
		DEFAULT_TUTOR_SETTINGS,
		buildSystemPrompt,
		normalizeCustomPrompt
	} from '#lib/live/tutor-prompt.js';

	/** @typedef {{ id: string, title: string, content: string }} CustomPrompt */

	/**
	 * @type {{
	 *   settings: import('#lib/live/tutor-prompt.js').TutorSettings,
	 *   disabled?: boolean,
	 *   loggedIn?: boolean,
	 *   customPrompts?: CustomPrompt[],
	 *   customPromptsError?: string | null,
	 *   selectedPromptId?: string | null
	 * }}
	 */
	let {
		settings = $bindable(),
		disabled = false,
		loggedIn = false,
		customPrompts = [],
		customPromptsError = null,
		selectedPromptId = $bindable(null)
	} = $props();

	let newTitle = $state('');
	let promptMessage = $state('');

	const selectedPrompt = $derived(customPrompts.find((p) => p.id === selectedPromptId));
	// 선택한 저장 프롬프트를 그대로 쓰고 있는가 (수정했으면 false)
	const usingSelected = $derived(
		Boolean(selectedPrompt) &&
			normalizeCustomPrompt(selectedPrompt?.content) === normalizeCustomPrompt(settings.customPrompt)
	);

	/** 저장된 프롬프트를 입력란에 불러온다 @param {CustomPrompt} p */
	function usePrompt(p) {
		settings.customPrompt = p.content;
		selectedPromptId = p.id;
		promptMessage = '';
	}

	function clearPrompt() {
		settings.customPrompt = '';
		selectedPromptId = null;
	}

	/** 폼 액션 결과 메시지를 보여 주고 선택 상태를 맞춘다 @type {import('@sveltejs/kit').SubmitFunction} */
	const handlePromptAction = ({ action, cancel }) => {
		if (action.search.includes('delete') && !confirm('이 프롬프트를 삭제할까요?')) {
			cancel();
			return;
		}
		return async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success' || result.type === 'failure') {
				promptMessage = result.data?.promptMessage ?? '';
			}
			if (result.type !== 'success') return;
			if (result.data?.savedPromptId) {
				selectedPromptId = result.data.savedPromptId;
				newTitle = '';
			}
			if (result.data?.deletedPromptId === selectedPromptId) selectedPromptId = null;
		};
	};

	// 2번째 줄(영어로만·짧게 대답)은 실시간 음성 대화를 위해 고정
	const FIXED_LINE = 1;
	const promptLines = $derived(buildSystemPrompt(settings).split('\n'));

	const levelLabel = $derived(TUTOR_LEVELS.find((l) => l.value === settings.level)?.label);
	const correctionLabel = $derived(CORRECTION_STYLES.find((c) => c.value === settings.correction)?.label);

	function reset() {
		Object.assign(settings, DEFAULT_TUTOR_SETTINGS);
		selectedPromptId = null;
	}
</script>

<details class="group rounded-2xl border border-slate-200 bg-white shadow-sm" open={!disabled}>
	<summary class="flex cursor-pointer list-none items-center gap-3 px-5 py-3">
		<h2 class="text-sm font-semibold text-slate-700">튜터 설정</h2>
		<p class="min-w-0 flex-1 truncate text-xs text-slate-400">
			{levelLabel} · {correctionLabel} · 한국어 도움 {settings.koreanHelp ? '켬' : '끔'}
			{#if settings.topic}· {settings.topic}{/if}
			{#if settings.customPrompt.trim()}· 커스텀 프롬프트{#if usingSelected} '{selectedPrompt?.title}'{/if}{/if}
		</p>
		<span class="text-slate-400 transition group-open:rotate-90" aria-hidden="true">›</span>
	</summary>

	<fieldset {disabled} class="space-y-5 border-t border-slate-100 px-5 py-4 disabled:opacity-60">
		{#if disabled}
			<p class="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
				대화 중에는 바꿀 수 없어요. 대화를 종료한 뒤 바꾸면 다음 대화부터 적용됩니다.
			</p>
		{/if}

		<!-- 레벨 -->
		<div>
			<p class="mb-2 text-xs font-semibold text-slate-600">내 영어 수준</p>
			<div class="grid grid-cols-3 gap-2">
				{#each TUTOR_LEVELS as level (level.value)}
					<label
						class="cursor-pointer rounded-xl border px-3 py-2 text-center transition has-checked:border-emerald-500 has-checked:bg-emerald-50 {disabled
							? 'cursor-not-allowed'
							: 'hover:bg-slate-50'} border-slate-200"
					>
						<input type="radio" class="sr-only" value={level.value} bind:group={settings.level} />
						<span class="block text-sm font-medium text-slate-800">{level.label}</span>
						<span class="mt-0.5 block text-[11px] leading-tight text-slate-500">{level.description}</span>
					</label>
				{/each}
			</div>
		</div>

		<!-- 주제 -->
		<div>
			<label for="tutor-topic" class="mb-2 block text-xs font-semibold text-slate-600">대화 주제</label>
			<div class="mb-2 flex flex-wrap gap-1.5">
				{#each TOPIC_SUGGESTIONS as topic (topic.label)}
					<button
						type="button"
						onclick={() => (settings.topic = topic.value)}
						class="rounded-full border px-3 py-1 text-xs transition {settings.topic === topic.value
							? 'border-emerald-500 bg-emerald-50 text-emerald-700'
							: 'border-slate-200 text-slate-600 hover:bg-slate-50'}"
					>
						{topic.label}
					</button>
				{/each}
			</div>
			<input
				id="tutor-topic"
				bind:value={settings.topic}
				maxlength={TOPIC_MAX_LENGTH}
				placeholder="직접 입력 (예: 병원 예약하기, 좋아하는 영화) — 비우면 하루 일과"
				class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
			/>
		</div>

		<!-- 커스텀 프롬프트: 직접 쓰고, 저장해 두고, 골라 쓰기 -->
		<div>
			<div class="mb-2 flex items-baseline justify-between gap-2">
				<label for="tutor-custom-prompt" class="text-xs font-semibold text-slate-600">
					커스텀 프롬프트 <span class="font-normal text-slate-400">(선택)</span>
				</label>
				<span class="text-[11px] text-slate-400 tabular-nums">
					{settings.customPrompt.length}/{CUSTOM_PROMPT_MAX_LENGTH}
				</span>
			</div>
			<textarea
				id="tutor-custom-prompt"
				bind:value={settings.customPrompt}
				maxlength={CUSTOM_PROMPT_MAX_LENGTH}
				rows="3"
				placeholder="튜터에게 따로 바라는 점을 자유롭게 적어 주세요.&#10;예: 내가 말한 문장을 더 자연스러운 표현으로 하나씩 알려 줘 / 면접관처럼 꼬리 질문을 해 줘"
				class="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
			></textarea>
			<div class="mt-1 flex items-start justify-between gap-3">
				<p class="text-[11px] text-slate-400">
					한국어로 써도 돼요. '영어로만·짧게 대답' 규칙과 부딪히는 요청은 적용되지 않을 수 있어요.
				</p>
				{#if settings.customPrompt}
					<button type="button" onclick={clearPrompt} class="shrink-0 text-[11px] text-slate-500 hover:underline">
						지우기
					</button>
				{/if}
			</div>

			{#if loggedIn}
				<!-- 새로 저장 -->
				<form
					method="POST"
					action="?/saveCustomPrompt"
					use:enhance={handlePromptAction}
					class="mt-2 flex flex-wrap gap-2"
				>
					<input type="hidden" name="content" value={settings.customPrompt} />
					<input
						name="title"
						bind:value={newTitle}
						maxlength="30"
						placeholder="이름 (예: 면접 연습)"
						class="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
					/>
					<button
						disabled={!settings.customPrompt.trim() || !newTitle.trim()}
						class="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
					>
						새로 저장
					</button>
				</form>

				<!-- 불러온 프롬프트를 고쳤다면 덮어쓰기 -->
				{#if selectedPrompt && !usingSelected && settings.customPrompt.trim()}
					<form method="POST" action="?/saveCustomPrompt" use:enhance={handlePromptAction} class="mt-2">
						<input type="hidden" name="id" value={selectedPrompt.id} />
						<input type="hidden" name="content" value={settings.customPrompt} />
						<button class="text-xs font-medium text-emerald-700 hover:underline">
							'{selectedPrompt.title}'에 수정한 내용 덮어쓰기
						</button>
					</form>
				{/if}

				{#if promptMessage}
					<p class="mt-2 text-xs text-slate-600">{promptMessage}</p>
				{/if}

				<!-- 저장된 프롬프트 목록 -->
				<p class="mt-3 mb-1.5 text-xs font-semibold text-slate-600">내 저장 프롬프트</p>
				{#if customPromptsError}
					<p class="rounded-lg bg-red-50 px-3 py-2 text-xs break-words text-red-700">
						저장된 프롬프트를 불러오지 못했습니다: {customPromptsError}
						<span class="block text-red-500">supabase/sql/create_custom_prompts.sql 을 실행했는지 확인하세요.</span>
					</p>
				{:else if customPrompts.length === 0}
					<p class="text-xs text-slate-400">아직 저장한 프롬프트가 없어요. 위에서 작성하고 이름을 붙여 저장해 보세요.</p>
				{:else}
					<ul class="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
						{#each customPrompts as p (p.id)}
							<li class="flex items-start gap-2 px-3 py-2 {p.id === selectedPromptId ? 'bg-emerald-50' : ''}">
								<div class="min-w-0 flex-1">
									<p class="flex items-center gap-1.5 text-sm font-medium text-slate-800">
										<span class="truncate">{p.title}</span>
										{#if p.id === selectedPromptId && usingSelected}
											<span class="shrink-0 rounded bg-emerald-500 px-1.5 text-[10px] text-white">사용 중</span>
										{:else if p.id === selectedPromptId}
											<span class="shrink-0 rounded bg-amber-100 px-1.5 text-[10px] text-amber-700">수정됨</span>
										{/if}
									</p>
									<p class="line-clamp-2 text-xs whitespace-pre-line text-slate-500">{p.content}</p>
								</div>
								<button
									type="button"
									onclick={() => usePrompt(p)}
									class="shrink-0 rounded-full border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-white"
								>
									사용
								</button>
								<form method="POST" action="?/deleteCustomPrompt" use:enhance={handlePromptAction}>
									<input type="hidden" name="id" value={p.id} />
									<button class="shrink-0 px-1.5 py-1 text-xs text-red-500 hover:underline">삭제</button>
								</form>
							</li>
						{/each}
					</ul>
				{/if}
			{:else}
				<p class="mt-2 text-xs text-slate-500">
					<a href="/login" class="font-medium underline">로그인</a>하면 프롬프트를 저장해 두고 다시 쓸 수 있어요.
				</p>
			{/if}
		</div>

		<!-- 교정 방식 -->
		<div>
			<p class="mb-2 text-xs font-semibold text-slate-600">실수 교정 방식</p>
			<div class="space-y-1.5">
				{#each CORRECTION_STYLES as style (style.value)}
					<label
						class="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 px-3 py-2 transition has-checked:border-emerald-500 has-checked:bg-emerald-50"
					>
						<input
							type="radio"
							class="mt-1 accent-emerald-500"
							value={style.value}
							bind:group={settings.correction}
						/>
						<span>
							<span class="block text-sm font-medium text-slate-800">{style.label}</span>
							<span class="block text-xs text-slate-500">{style.description}</span>
						</span>
					</label>
				{/each}
			</div>
		</div>

		<!-- 한국어 도움 -->
		<label class="flex cursor-pointer items-center justify-between gap-4">
			<span>
				<span class="block text-xs font-semibold text-slate-600">막히면 한국어로 말해도 도와주기</span>
				<span class="block text-xs text-slate-500">
					{settings.koreanHelp ? '한국어로 말하면 짧은 영어 힌트를 줘요' : '한국어로 말하면 영어로 다시 말해 보도록 권해요'}
				</span>
			</span>
			<input type="checkbox" class="h-5 w-5 accent-emerald-500" bind:checked={settings.koreanHelp} />
		</label>

		<!-- 미리보기 -->
		<details class="rounded-lg bg-slate-50 px-3 py-2">
			<summary class="cursor-pointer text-xs font-medium text-slate-600">튜터에게 전달되는 지시문 미리보기</summary>
			<ul class="mt-2 space-y-1.5 text-xs leading-relaxed">
				{#each promptLines as line, i (i)}
					<li class="flex gap-2 {i === FIXED_LINE ? 'text-slate-400' : 'text-slate-700'}">
						<span
							class="mt-0.5 h-fit shrink-0 rounded px-1.5 text-[10px] font-medium {i === FIXED_LINE
								? 'bg-slate-200 text-slate-500'
								: 'bg-emerald-100 text-emerald-700'}"
						>
							{i === FIXED_LINE ? '고정' : '설정'}
						</span>
						<span class="font-mono break-words">{line}</span>
					</li>
				{/each}
			</ul>
			<p class="mt-2 text-[11px] text-slate-400">
				'고정' 줄은 실시간 음성 대화의 응답 속도와 흐름을 위해 바꿀 수 없어요.
			</p>
		</details>

		<div class="flex justify-end">
			<button type="button" onclick={reset} class="text-xs text-slate-500 hover:text-slate-800 hover:underline">
				기본값으로 되돌리기
			</button>
		</div>
	</fieldset>
</details>
