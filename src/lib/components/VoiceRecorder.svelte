<script>
	import { untrack } from 'svelte';

	/** @typedef {{ id: string, name: string, url: string, blob: Blob, duration: number, createdAt: Date }} Recording */

	let status = $state(/** @type {'idle' | 'recording' | 'paused'} */ ('idle'));
	let elapsed = $state(0);
	let error = $state('');
	let recordings = $state(/** @type {Recording[]} */ ([]));

	/** @type {HTMLCanvasElement | undefined} */
	let canvas = $state();

	/** @type {MediaRecorder | null} */
	let recorder = null;
	/** @type {MediaStream | null} */
	let stream = null;
	/** @type {AudioContext | null} */
	let audioCtx = null;
	/** @type {AnalyserNode | null} */
	let analyser = null;
	/** @type {Blob[]} */
	let chunks = [];
	let rafId = 0;
	let timerId = 0;
	let startedAt = 0;
	let accumulated = 0;

	function pickMimeType() {
		const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
		return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
	}

	/** @param {string} mime */
	function extensionFor(mime) {
		if (mime.includes('mp4')) return 'm4a';
		if (mime.includes('ogg')) return 'ogg';
		if (mime.includes('wav')) return 'wav';
		if (mime.includes('mpeg')) return 'mp3';
		return 'webm';
	}

	/** @param {number} sec */
	function formatTime(sec) {
		if (!Number.isFinite(sec)) return '--:--';
		const m = Math.floor(sec / 60);
		const s = Math.floor(sec % 60);
		return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}

	function currentElapsed() {
		return accumulated + (status === 'recording' ? (performance.now() - startedAt) / 1000 : 0);
	}

	async function start() {
		error = '';
		if (!navigator.mediaDevices?.getUserMedia) {
			error = '이 브라우저는 마이크 녹음을 지원하지 않습니다.';
			return;
		}
		try {
			stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		} catch (e) {
			error =
				e instanceof DOMException && e.name === 'NotAllowedError'
					? '마이크 권한이 거부되었습니다. 브라우저 설정에서 마이크를 허용해 주세요.'
					: '마이크를 사용할 수 없습니다.';
			return;
		}

		const mimeType = pickMimeType();
		recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
		chunks = [];
		recorder.ondataavailable = (e) => {
			if (e.data.size > 0) chunks.push(e.data);
		};
		recorder.onstop = finalize;
		recorder.start(250);

		audioCtx = new AudioContext();
		analyser = audioCtx.createAnalyser();
		analyser.fftSize = 2048;
		audioCtx.createMediaStreamSource(stream).connect(analyser);

		accumulated = 0;
		startedAt = performance.now();
		elapsed = 0;
		status = 'recording';
		timerId = window.setInterval(() => (elapsed = currentElapsed()), 100);
		draw();
	}

	function pause() {
		if (!recorder || status !== 'recording') return;
		recorder.pause();
		accumulated = currentElapsed();
		status = 'paused';
	}

	function resume() {
		if (!recorder || status !== 'paused') return;
		recorder.resume();
		startedAt = performance.now();
		status = 'recording';
	}

	function stop() {
		if (!recorder || status === 'idle') return;
		accumulated = currentElapsed();
		recorder.stop();
	}

	function finalize() {
		const type = recorder?.mimeType || 'audio/webm';
		const blob = new Blob(chunks, { type });
		const createdAt = new Date();
		const n = recordings.length + 1;
		recordings.unshift({
			id: crypto.randomUUID(),
			name: `녹음 ${n}`,
			url: URL.createObjectURL(blob),
			blob,
			duration: accumulated,
			createdAt
		});
		cleanup();
	}

	function cleanup() {
		cancelAnimationFrame(rafId);
		clearInterval(timerId);
		stream?.getTracks().forEach((t) => t.stop());
		audioCtx?.close();
		stream = null;
		audioCtx = null;
		analyser = null;
		recorder = null;
		status = 'idle';
		elapsed = 0;
		clearCanvas();
	}

	function clearCanvas() {
		const ctx = canvas?.getContext('2d');
		if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
	}

	function draw() {
		if (!analyser || !canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		const w = canvas.clientWidth;
		const h = canvas.clientHeight;
		if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
			canvas.width = w * dpr;
			canvas.height = h * dpr;
		}
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		const data = new Uint8Array(analyser.fftSize);
		analyser.getByteTimeDomainData(data);

		ctx.clearRect(0, 0, w, h);
		ctx.lineWidth = 2;
		ctx.strokeStyle = status === 'paused' ? '#94a3b8' : '#ef4444';
		ctx.beginPath();
		const step = w / data.length;
		for (let i = 0; i < data.length; i++) {
			const y = (data[i] / 255) * h;
			if (i === 0) ctx.moveTo(0, y);
			else ctx.lineTo(i * step, y);
		}
		ctx.stroke();

		rafId = requestAnimationFrame(draw);
	}

	/** @param {Event} e */
	async function onFileInput(e) {
		const input = /** @type {HTMLInputElement} */ (e.currentTarget);
		for (const file of Array.from(input.files ?? [])) {
			if (!file.type.startsWith('audio/')) {
				error = `${file.name}: 오디오 파일이 아닙니다.`;
				continue;
			}
			const url = URL.createObjectURL(file);
			const duration = await probeDuration(url);
			recordings.unshift({
				id: crypto.randomUUID(),
				name: file.name.replace(/\.[^.]+$/, ''),
				url,
				blob: file,
				duration,
				createdAt: new Date()
			});
		}
		input.value = '';
	}

	/** @param {string} url @returns {Promise<number>} */
	function probeDuration(url) {
		return new Promise((resolve) => {
			const a = new Audio();
			a.preload = 'metadata';
			a.onloadedmetadata = () => resolve(a.duration);
			a.onerror = () => resolve(NaN);
			a.src = url;
		});
	}

	/** @param {Recording} rec */
	function download(rec) {
		const a = document.createElement('a');
		a.href = rec.url;
		a.download = `${rec.name}.${extensionFor(rec.blob.type)}`;
		a.click();
	}

	/** @param {string} id */
	function remove(id) {
		const rec = recordings.find((r) => r.id === id);
		if (rec) URL.revokeObjectURL(rec.url);
		recordings = recordings.filter((r) => r.id !== id);
	}

	/** @param {number} bytes */
	function formatSize(bytes) {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
	}

	// $effect는 브라우저에서만 실행되므로 정리 로직을 여기에 둔다 (onDestroy는 SSR에서도 실행됨)
	$effect(() => () => {
		if (recorder && recorder.state !== 'inactive') {
			recorder.onstop = null;
			recorder.stop();
		}
		cleanup();
		untrack(() => recordings).forEach((r) => URL.revokeObjectURL(r.url));
	});
</script>

<section class="mx-auto w-full max-w-2xl space-y-6">
	<!-- 녹음 패널 -->
	<div class="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
		<div class="mb-4 flex items-center justify-between">
			<div class="flex items-center gap-2">
				<span
					class="h-3 w-3 rounded-full {status === 'recording'
						? 'animate-pulse bg-red-500'
						: status === 'paused'
							? 'bg-amber-400'
							: 'bg-slate-300'}"
				></span>
				<span class="text-sm font-medium text-slate-600">
					{status === 'recording' ? '녹음 중' : status === 'paused' ? '일시정지' : '대기'}
				</span>
			</div>
			<span class="font-mono text-2xl tabular-nums text-slate-800">{formatTime(elapsed)}</span>
		</div>

		<div class="relative mb-5 h-24 overflow-hidden rounded-xl bg-slate-50">
			<canvas bind:this={canvas} class="h-full w-full"></canvas>
			{#if status === 'idle'}
				<p class="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
					녹음 버튼을 눌러 시작하세요
				</p>
			{/if}
		</div>

		<div class="flex flex-wrap items-center justify-center gap-3">
			{#if status === 'idle'}
				<button
					onclick={start}
					class="flex items-center gap-2 rounded-full bg-red-500 px-6 py-3 font-semibold text-white shadow transition hover:bg-red-600"
				>
					<span class="h-3 w-3 rounded-full bg-white"></span>
					녹음 시작
				</button>
				<label
					class="cursor-pointer rounded-full border border-slate-300 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
				>
					파일 불러오기
					<input type="file" accept="audio/*" multiple class="hidden" onchange={onFileInput} />
				</label>
			{:else}
				{#if status === 'recording'}
					<button
						onclick={pause}
						class="rounded-full border border-slate-300 px-5 py-3 font-medium text-slate-700 transition hover:bg-slate-50"
					>
						일시정지
					</button>
				{:else}
					<button
						onclick={resume}
						class="rounded-full border border-slate-300 px-5 py-3 font-medium text-slate-700 transition hover:bg-slate-50"
					>
						계속 녹음
					</button>
				{/if}
				<button
					onclick={stop}
					class="flex items-center gap-2 rounded-full bg-slate-800 px-6 py-3 font-semibold text-white shadow transition hover:bg-slate-900"
				>
					<span class="h-3 w-3 rounded-sm bg-white"></span>
					정지 및 저장
				</button>
			{/if}
		</div>

		{#if error}
			<p class="mt-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
		{/if}
	</div>

	<!-- 녹음 목록 -->
	<div class="space-y-3">
		<h2 class="text-lg font-semibold text-slate-800">
			내 녹음 <span class="text-sm font-normal text-slate-500">({recordings.length})</span>
		</h2>

		{#if recordings.length === 0}
			<p class="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-400">
				아직 녹음이 없습니다.
			</p>
		{:else}
			<ul class="space-y-3">
				{#each recordings as rec (rec.id)}
					<li class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
						<div class="mb-3 flex items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<input
									bind:value={rec.name}
									class="w-full truncate rounded bg-transparent px-1 font-medium text-slate-800 outline-none focus:bg-slate-50 focus:ring-1 focus:ring-slate-300"
									aria-label="녹음 이름"
								/>
								<p class="px-1 text-xs text-slate-500">
									{rec.createdAt.toLocaleString('ko-KR')} · {formatTime(rec.duration)} · {formatSize(
										rec.blob.size
									)}
								</p>
							</div>
							<div class="flex shrink-0 gap-1">
								<button
									onclick={() => download(rec)}
									class="rounded-lg px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
								>
									다운로드
								</button>
								<button
									onclick={() => remove(rec.id)}
									class="rounded-lg px-3 py-1.5 text-sm text-red-600 transition hover:bg-red-50"
								>
									삭제
								</button>
							</div>
						</div>
						<audio controls src={rec.url} class="w-full"></audio>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</section>
