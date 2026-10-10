<!-- src/routes/signup/+page.svelte -->
<script>
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { MIN_PASSWORD_LENGTH } from '#lib/auth.js';

	let { form } = $props();
	let pending = $state(false);

	// value={...} 로만 연결하면 다른 입력란이 바뀌어 다시 그릴 때 입력한 이메일이 지워지므로 상태로 묶는다
	let email = $state(untrack(() => form?.email ?? ''));
	let password = $state('');
	let passwordConfirm = $state('');

	const lengthOk = $derived(password.length >= MIN_PASSWORD_LENGTH);
	const matchOk = $derived(passwordConfirm.length > 0 && password === passwordConfirm);
	const canSubmit = $derived(lengthOk && matchOk && !pending);
</script>

<svelte:head>
	<title>회원가입</title>
</svelte:head>

<div class="mx-auto max-w-sm">
	<h1 class="text-2xl font-bold text-slate-900">회원가입</h1>
	<p class="mt-1 text-sm text-slate-500">이메일로 새 계정을 만드세요.</p>

	{#if form?.sent}
		<div class="mt-6 rounded-xl bg-white p-6 text-sm text-slate-700 shadow-sm">
			<p class="font-medium text-emerald-600">✅ 인증 메일을 보냈습니다.</p>
			<p class="mt-2">
				<strong>{form.email}</strong> 메일함에서 인증 링크를 누르면 가입이 완료되고 자동으로 로그인됩니다.
			</p>
		</div>
	{:else}
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
				<span class="text-sm font-medium text-slate-700">
					비밀번호 <span class="text-slate-400">({MIN_PASSWORD_LENGTH}자 이상)</span>
				</span>
				<input
					name="password"
					type="password"
					autocomplete="new-password"
					minlength={MIN_PASSWORD_LENGTH}
					required
					bind:value={password}
					aria-describedby="password-hint"
					class="mt-1 w-full rounded-lg border px-3 py-2 text-sm {password && !lengthOk
						? 'border-red-400'
						: 'border-slate-300'}"
				/>
				<span id="password-hint" aria-live="polite" class="mt-1 flex justify-between text-xs">
					{#if !password}
						<span class="text-slate-400">{MIN_PASSWORD_LENGTH}자 이상 입력하세요.</span>
					{:else if lengthOk}
						<span class="text-emerald-600">✓ 사용할 수 있는 길이입니다.</span>
					{:else}
						<span class="text-red-600">{MIN_PASSWORD_LENGTH - password.length}자 더 입력하세요.</span>
					{/if}
					<span class={lengthOk ? 'text-emerald-600' : 'text-slate-400'}>
						{password.length}/{MIN_PASSWORD_LENGTH}자
					</span>
				</span>
			</label>
			<label class="block">
				<span class="text-sm font-medium text-slate-700">비밀번호 확인</span>
				<input
					name="passwordConfirm"
					type="password"
					autocomplete="new-password"
					required
					bind:value={passwordConfirm}
					aria-describedby="confirm-hint"
					class="mt-1 w-full rounded-lg border px-3 py-2 text-sm {passwordConfirm && !matchOk
						? 'border-red-400'
						: 'border-slate-300'}"
				/>
				<span id="confirm-hint" aria-live="polite" class="mt-1 block text-xs">
					{#if !passwordConfirm}
						<span class="text-slate-400">비밀번호를 한 번 더 입력하세요.</span>
					{:else if matchOk}
						<span class="text-emerald-600">✓ 비밀번호가 일치합니다.</span>
					{:else}
						<span class="text-red-600">✗ 비밀번호가 일치하지 않습니다.</span>
					{/if}
				</span>
			</label>

			{#if form?.message}
				<p class="text-sm text-red-600">{form.message}</p>
			{/if}

			<button
				disabled={!canSubmit}
				class="w-full rounded-lg bg-slate-800 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
			>
				{pending ? '가입 중…' : '회원가입'}
			</button>
		</form>
	{/if}

	<p class="mt-4 text-center text-sm text-slate-500">
		이미 계정이 있나요? <a href="/login" class="font-medium text-slate-800 hover:underline">로그인</a>
	</p>
</div>
