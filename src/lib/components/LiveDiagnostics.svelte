<script>
	import { tick } from 'svelte';

	/** @type {{ session: import('#lib/live/live-session.svelte.js').LiveSession }} */
	let { session } = $props();

	const link = $derived(session.link);

	// "n초 전" 표시용 시계
	let now = $state(Date.now());
	$effect(() => {
		const id = setInterval(() => (now = Date.now()), 500);
		return () => clearInterval(id);
	});

	/** @param {number} at */
	function ago(at) {
		if (!at) return '—';
		const s = (now - at) / 1000;
		return s < 1 ? '방금' : `${Math.floor(s)}초 전`;
	}

	/** @typedef {'on' | 'busy' | 'off' | 'bad'} Tone */
	/** @type {Record<Tone, string>} */
	const dot = {
		on: 'bg-emerald-500',
		busy: 'bg-amber-400 animate-pulse',
		off: 'bg-slate-300',
		bad: 'bg-red-500'
	};

	const wsLabel = {
		none: '연결 없음',
		CONNECTING: '연결 중',
		OPEN: '연결됨',
		CLOSING: '종료 응답 대기',
		CLOSED: '닫힘'
	};
	/** @type {Tone} */
	const wsTone = $derived(
		link.ws === 'OPEN' ? 'on' : link.ws === 'CONNECTING' || link.ws === 'CLOSING' ? 'busy' : 'off'
	);

	/** @param {string} state @returns {Tone} */
	const ctxTone = (state) => (state === 'running' ? 'on' : state === 'suspended' ? 'busy' : 'off');
	/** @param {string} state */
	const ctxLabel = (state) =>
		({ none: '없음', running: '사용 중', suspended: '일시정지', closed: '해제됨' })[state] ?? state;

	const items = $derived([
		{ name: '서버 연결', value: wsLabel[link.ws], tone: wsTone, hint: 'WebSocket' },
		{
			name: '마이크',
			value: link.mic === 'live' ? (session.muted ? '켜짐 (음소거)' : '켜짐') : link.mic === 'ended' ? '해제됨' : '꺼짐',
			tone: /** @type {Tone} */ (link.mic === 'live' ? 'on' : 'off'),
			hint: 'MediaStreamTrack'
		},
		{ name: '마이크 처리', value: ctxLabel(link.inCtx), tone: ctxTone(link.inCtx), hint: '입력 AudioContext' },
		{ name: '스피커 출력', value: ctxLabel(link.outCtx), tone: ctxTone(link.outCtx), hint: '출력 AudioContext' }
	]);

	const neverConnected = $derived(session.log.length === 0);
	const close = $derived(link.close);

	const verdict = $derived.by(
		/** @returns {{ tone: 'live' | 'busy' | 'idle' | 'done', text: string }} */ () => {
		if (session.status === 'live') {
			return { tone: 'live', text: '서버와 연결되어 있습니다. 오디오를 주고받는 중입니다.' };
		}
		if (session.status === 'connecting') return { tone: 'busy', text: '연결하는 중입니다…' };
		if (neverConnected) return { tone: 'idle', text: '아직 연결한 적이 없습니다.' };
		if (!session.released) {
			return { tone: 'busy', text: '종료하는 중입니다. 서버 응답과 장치 해제를 기다리고 있습니다…' };
		}
		const detail = close
			? close.byClient
				? close.wasClean
					? `서버가 종료를 확인했습니다 (code ${close.code}, ${close.ms}ms)`
					: `연결이 닫혔습니다 (code ${close.code})`
				: `서버가 먼저 연결을 닫았습니다 (code ${close.code}${close.reason ? `: ${close.reason}` : ''})`
			: '서버 연결 전에 중단되었습니다';
		return { tone: 'done', text: `완전히 종료되었습니다. ${detail}. 마이크와 오디오 장치도 해제되었습니다.` };
	});

	const verdictStyle = {
		live: 'border-emerald-200 bg-emerald-50 text-emerald-800',
		busy: 'border-amber-200 bg-amber-50 text-amber-800',
		idle: 'border-slate-200 bg-slate-50 text-slate-500',
		done: 'border-sky-200 bg-sky-50 text-sky-800'
	};
	const verdictIcon = { live: '●', busy: '…', idle: '○', done: '✓' };

	const levelStyle = {
		info: 'text-slate-500',
		ok: 'text-emerald-600',
		warn: 'text-amber-600',
		error: 'text-red-600'
	};

	let open = $state(true);
	/** @type {HTMLOListElement | undefined} */
	let logBox = $state();
	$effect(() => {
		void session.log.length;
		tick().then(() => logBox?.scrollTo({ top: logBox.scrollHeight }));
	});
</script>

<div class="rounded-2xl border border-slate-200 bg-white shadow-sm">
	<div class="flex items-center justify-between border-b border-slate-100 px-5 py-3">
		<h2 class="text-sm font-semibold text-slate-700">연결 상태</h2>
		<span class="text-xs text-slate-400">브라우저 객체에서 직접 읽은 실제 상태</span>
	</div>

	<div class="space-y-4 px-5 py-4">
		<!-- 종합 판정 -->
		<p class="flex gap-2 rounded-lg border px-4 py-3 text-sm {verdictStyle[verdict.tone]}">
			<span class="font-bold">{verdictIcon[verdict.tone]}</span>
			<span>{verdict.text}</span>
		</p>

		<!-- 리소스별 상태 -->
		<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
			{#each items as item (item.name)}
				<div class="rounded-lg border border-slate-100 px-3 py-2" title={item.hint}>
					<p class="text-xs text-slate-400">{item.name}</p>
					<p class="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-slate-700">
						<span class="h-2 w-2 shrink-0 rounded-full {dot[item.tone]}"></span>
						{item.value}
					</p>
				</div>
			{/each}
		</div>

		<!-- 트래픽: 종료 후 숫자가 더 이상 늘지 않으면 실제로 통신이 멈춘 것 -->
		<div class="grid grid-cols-2 gap-2 text-sm">
			<div class="rounded-lg border border-slate-100 px-3 py-2">
				<p class="text-xs text-slate-400">보낸 오디오 조각 (20ms 단위)</p>
				<p class="mt-0.5 font-mono text-slate-700 tabular-nums">
					{link.sent.toLocaleString()} <span class="text-xs text-slate-400">· {ago(link.lastSentAt)}</span>
				</p>
			</div>
			<div class="rounded-lg border border-slate-100 px-3 py-2">
				<p class="text-xs text-slate-400">받은 서버 메시지</p>
				<p class="mt-0.5 font-mono text-slate-700 tabular-nums">
					{link.received.toLocaleString()} <span class="text-xs text-slate-400">· {ago(link.lastRecvAt)}</span>
				</p>
			</div>
		</div>

		<!-- 이벤트 로그 -->
		<div>
			<button
				onclick={() => (open = !open)}
				class="text-xs font-medium text-slate-500 hover:text-slate-700"
			>
				{open ? '▾' : '▸'} 이벤트 로그 ({session.log.length})
			</button>
			{#if open}
				<ol
					bind:this={logBox}
					class="mt-2 max-h-48 space-y-0.5 overflow-y-auto rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs"
				>
					{#if session.log.length === 0}
						<li class="text-slate-400">대화를 시작하면 연결 과정이 기록됩니다.</li>
					{/if}
					{#each session.log as entry (entry.id)}
						<li class="flex gap-2">
							<span class="shrink-0 text-slate-400 tabular-nums">{entry.time}</span>
							<span class={levelStyle[entry.level]}>{entry.text}</span>
						</li>
					{/each}
				</ol>
			{/if}
		</div>
	</div>
</div>
