<!-- src/routes/onboarding/+page.svelte -->
<script>
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { NAME_MAX_LENGTH, PHONE_RE, normalizePhone, formatPhone } from '#lib/auth.js';

	let { data, form } = $props();
	let pending = $state(false);

	// 입력값은 첫 렌더링 때만 채운다 (서버 검증 실패 시에는 방금 입력한 값, 처음에는 저장된 값)
	let fullName = $state(untrack(() => form?.fullName ?? data.fullName));
	let phone = $state(untrack(() => formatPhone(form?.phone ?? data.phone)));
	/** @type {string[]} */
	let agreed = $state([]);

	const documentIds = $derived(data.documents.map((d) => d.id));
	const allAgreed = $derived(documentIds.every((id) => agreed.includes(id)));
	const nameOk = $derived(fullName.trim().length > 0 && fullName.trim().length <= NAME_MAX_LENGTH);
	const phoneOk = $derived(PHONE_RE.test(normalizePhone(phone)));
	const canSubmit = $derived(nameOk && phoneOk && allAgreed && !pending);

	function toggleAll() {
		agreed = allAgreed ? [] : [...documentIds];
	}

	/** 입력하는 동안 하이픈을 자동으로 붙인다 */
	function onPhoneInput() {
		phone = formatPhone(normalizePhone(phone).slice(0, 11));
	}
</script>

<svelte:head>
	<title>회원 정보 입력</title>
</svelte:head>

<div class="mx-auto max-w-md">
	<h1 class="text-2xl font-bold text-slate-900">환영합니다!</h1>
	<p class="mt-1 text-sm text-slate-500">
		서비스를 이용하려면 회원 정보를 입력하고 약관에 동의해 주세요.
	</p>

	<form
		method="POST"
		use:enhance={() => {
			pending = true;
			return async ({ update }) => {
				await update({ reset: false });
				pending = false;
			};
		}}
		class="mt-6 space-y-6 rounded-xl bg-white p-6 shadow-sm"
	>
		<section class="space-y-4">
			<h2 class="text-sm font-semibold text-slate-900">회원 정보</h2>
			<label class="block">
				<span class="text-sm font-medium text-slate-700">이메일</span>
				<input
					value={data.email}
					disabled
					class="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500"
				/>
			</label>
			<label class="block">
				<span class="text-sm font-medium text-slate-700">이름</span>
				<input
					name="fullName"
					autocomplete="name"
					maxlength={NAME_MAX_LENGTH}
					required
					bind:value={fullName}
					class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-sm font-medium text-slate-700">휴대전화 번호</span>
				<input
					name="phone"
					type="tel"
					inputmode="numeric"
					autocomplete="tel-national"
					placeholder="010-1234-5678"
					required
					bind:value={phone}
					oninput={onPhoneInput}
					aria-describedby="phone-hint"
					class="mt-1 w-full rounded-lg border px-3 py-2 text-sm {phone && !phoneOk
						? 'border-red-400'
						: 'border-slate-300'}"
				/>
				{#if phone && !phoneOk}
					<span id="phone-hint" class="mt-1 block text-xs text-red-600">
						휴대전화 번호 형식이 아닙니다. (예: 010-1234-5678)
					</span>
				{/if}
			</label>
		</section>

		{#if data.documents.length > 0}
			<section class="space-y-3">
				<h2 class="text-sm font-semibold text-slate-900">약관 동의</h2>

				<label class="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5">
					<input type="checkbox" checked={allAgreed} onchange={toggleAll} class="size-4" />
					<span class="text-sm font-semibold text-slate-900">전체 동의</span>
				</label>

				{#each data.documents as doc (doc.id)}
					<div class="rounded-lg border border-slate-200">
						<label class="flex items-center gap-2 px-3 py-2.5">
							<input type="checkbox" name="agree" value={doc.id} bind:group={agreed} class="size-4" />
							<span class="text-sm text-slate-700">
								<span class="font-medium text-red-600">[필수]</span>
								{doc.title}에 동의합니다.
							</span>
						</label>
						<details class="border-t border-slate-200 px-3 py-2">
							<summary class="cursor-pointer text-xs text-slate-500">
								전문 보기 <span class="text-slate-400">(시행 {doc.version})</span>
							</summary>
							<div class="mt-2 max-h-48 overflow-y-auto text-xs leading-relaxed whitespace-pre-line text-slate-600">
								{doc.content}
							</div>
						</details>
					</div>
				{/each}

				<p class="text-xs text-slate-400">
					필수 항목에 동의하지 않으면 서비스를 이용할 수 없습니다.
				</p>
			</section>
		{/if}

		{#if form?.message}
			<p class="text-sm text-red-600">{form.message}</p>
		{/if}

		<button
			disabled={!canSubmit}
			class="w-full rounded-lg bg-slate-800 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
		>
			{pending ? '저장 중…' : '동의하고 시작하기'}
		</button>
	</form>
</div>
