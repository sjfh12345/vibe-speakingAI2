<!-- src/routes/login/+page.svelte -->
<script>
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { MIN_PASSWORD_LENGTH } from '#lib/auth.js';

	let { form } = $props();
	let pending = $state(false);

	// value={...} 로만 연결하면 다른 입력란이 바뀌어 다시 그릴 때 입력한 이메일이 지워지므로 상태로 묶는다
	// (서버 검증 실패 후 다시 그려질 때는 보냈던 이메일을 채운다)
	let email = $state(untrack(() => form?.email ?? ''));
	let password = $state('');
	const lengthOk = $derived(password.length >= MIN_PASSWORD_LENGTH);

	const confirmFailed = $derived(page.url.searchParams.get('error') === 'confirm');
	const deleted = $derived(page.url.searchParams.has('deleted'));
</script>

<svelte:head>
	<title>로그인</title>
</svelte:head>

<div class="mx-auto max-w-sm">
	<h1 class="text-2xl font-bold text-slate-900">로그인</h1>
	<p class="mt-1 text-sm text-slate-500">이메일과 비밀번호로 로그인하세요.</p>

	{#if deleted}
		<p class="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
			회원 탈퇴가 완료되었습니다. 그동안 이용해 주셔서 감사합니다.
		</p>
	{/if}

	<form
		method="POST"
		use:enhance={() => {
			pending = true;
			return async ({ update }) => {
				await update({ reset: false });
				pending = false;
			};
		}}
		class="mt-6 space-y-4 rounded-xl bg-white p-6 shadow-sm"
	>
		<label class="block">
			<span class="text-sm font-medium text-slate-700">이메일</span>
			<input
				name="email"
				type="email"
				autocomplete="email"
				required
				bind:value={email}
				class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
			/>
		</label>
		<label class="block">
			<span class="text-sm font-medium text-slate-700">비밀번호</span>
			<input
				name="password"
				type="password"
				autocomplete="current-password"
				required
				bind:value={password}
				aria-describedby="password-hint"
				class="mt-1 w-full rounded-lg border px-3 py-2 text-sm {password && !lengthOk
					? 'border-red-400'
					: 'border-slate-300'}"
			/>
			<span id="password-hint" aria-live="polite" class="mt-1 flex justify-between text-xs">
				{#if password && !lengthOk}
					<span class="text-red-600">비밀번호는 {MIN_PASSWORD_LENGTH}자 이상입니다.</span>
				{:else}
					<span></span>
				{/if}
				<span class={lengthOk ? 'text-emerald-600' : 'text-slate-400'}>{password.length}자</span>
			</span>
		</label>

		{#if form?.message}
			<p class="text-sm text-red-600">{form.message}</p>
		{:else if confirmFailed}
			<p class="text-sm text-red-600">이메일 인증에 실패했습니다. 링크가 만료되었을 수 있습니다.</p>
		{/if}

		<button
			disabled={pending || !lengthOk}
			class="w-full rounded-lg bg-slate-800 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
		>
			{pending ? '로그인 중…' : '로그인'}
		</button>
	</form>

	<p class="mt-4 text-center text-sm text-slate-500">
		계정이 없나요? <a href="/signup" class="font-medium text-slate-800 hover:underline">회원가입</a>
	</p>
</div>
