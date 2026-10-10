<script>
	import LiveTutor from '#lib/components/LiveTutor.svelte';

	let { data } = $props();
</script>

<svelte:head>
	<title>실시간 영어회화</title>
</svelte:head>

<header class="mx-auto mb-8 max-w-2xl">
	<h1 class="text-2xl font-bold text-slate-900">실시간 영어회화</h1>
	<p class="mt-1 text-sm text-slate-500">AI 튜터와 영어로 바로 대화해 보세요. 말을 멈추면 곧바로 대답합니다.</p>
</header>
<LiveTutor customPrompts={data.customPrompts} customPromptsError={data.customPromptsError} />
