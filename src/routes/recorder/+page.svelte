<script>
	import VoiceRecorder from '#lib/components/VoiceRecorder.svelte';
</script>

<svelte:head>
	<title>음성 녹음</title>
</svelte:head>

<header class="mx-auto mb-8 max-w-2xl">
	<h1 class="text-2xl font-bold text-slate-900">음성 녹음</h1>
	<p class="mt-1 text-sm text-slate-500">목소리를 녹음하고 바로 들어보며 확인하세요.</p>
</header>
<VoiceRecorder />
