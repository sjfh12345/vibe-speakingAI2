<!-- src/routes/account/+page.svelte -->
<script>
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { DELETE_CONFIRM_TEXT, MIN_PASSWORD_LENGTH, NAME_MAX_LENGTH, PHONE_RE, normalizePhone, formatPhone } from '#lib/auth.js';
	import { formatDate, formatTime } from '#lib/format.js';

	let { data, form } = $props();

	/** @type {'profile' | 'password' | 'deletion' | null} */
	let pending = $state(null);

	// 탈퇴 실패로 돌아온 경우에는 입력 폼을 열어 둔다
	let deleteOpen = $state(untrack(() => Boolean(form?.deletion)));
	let deleteConfirmText = $state('');

	// 입력값은 첫 렌더링 때만 채운다. 저장 후에는 입력한 값이 그대로 남는다
	let fullName = $state(untrack(() => data.profile.full_name ?? ''));
	let phone = $state(untrack(() => formatPhone(data.profile.phone ?? '')));

	const nameOk = $derived(fullName.trim().length > 0 && fullName.trim().length <= NAME_MAX_LENGTH);
	const phoneOk = $derived(PHONE_RE.test(normalizePhone(phone)));
	const profileDirty = $derived(
		fullName.trim() !== (data.profile.full_name ?? '') || normalizePhone(phone) !== (data.profile.phone ?? '')
	);

	function onPhoneInput() {
		phone = formatPhone(normalizePhone(phone).slice(0, 11));
	}

	function resetProfile() {
		fullName = data.profile.full_name ?? '';
		phone = formatPhone(data.profile.phone ?? '');
	}

	/** @param {'profile' | 'password' | 'deletion'} name @param {boolean} reset */
	function submitting(name, reset) {
		/** @type {import('@sveltejs/kit').SubmitFunction} */
		return () => {
			pending = name;
			return async ({ update }) => {
				await update({ reset });
				pending = null;
			};
		};
	}

	/** @param {string} value */
	const formatDateTime = (value) => `${formatDate(value)} ${formatTime(value)}`;

	const DOCUMENT_TYPE_LABELS = /** @type {Record<string, string>} */ ({
		terms: '이용약관',
		privacy: '개인정보'
	});
</script>

<svelte:head>
	<title>내 프로필</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<div>
		<h1 class="text-2xl font-bold text-slate-900">내 프로필</h1>
		<p class="mt-1 text-sm text-slate-500">회원 정보를 확인하고 수정할 수 있습니다.</p>
	</div>

	<!-- 회원 정보 -->
	<section class="rounded-xl bg-white p-6 shadow-sm">
		<h2 class="font-semibold text-slate-900">회원 정보</h2>

		<dl class="mt-4 grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
			<dt class="text-slate-500">이메일</dt>
			<dd class="text-slate-800">{data.profile.email}</dd>
			<dt class="text-slate-500">가입일</dt>
			<dd class="text-slate-800">{formatDate(data.profile.created_at)}</dd>
			{#if data.lastSignInAt}
				<dt class="text-slate-500">최근 로그인</dt>
				<dd class="text-slate-800">{formatDateTime(data.lastSignInAt)}</dd>
			{/if}
		</dl>

		<form
			method="POST"
			action="?/updateProfile"
			use:enhance={submitting('profile', false)}
			class="mt-6 space-y-4 border-t border-slate-100 pt-6"
		>
			<label class="block">
				<span class="text-sm font-medium text-slate-700">이름</span>
				<input
					name="fullName"
					autocomplete="name"
					maxlength={NAME_MAX_LENGTH}
					required
					bind:value={fullName}
					class="mt-1 w-full rounded-lg border px-3 py-2 text-sm {fullName && !nameOk
						? 'border-red-400'
						: 'border-slate-300'}"
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
					class="mt-1 w-full rounded-lg border px-3 py-2 text-sm {phone && !phoneOk
						? 'border-red-400'
						: 'border-slate-300'}"
				/>
				{#if phone && !phoneOk}
					<span class="mt-1 block text-xs text-red-600">휴대전화 번호 형식이 아닙니다. (예: 010-1234-5678)</span>
				{/if}
			</label>

			{#if form?.profile?.message}
				<p class="text-sm {form.profile.success ? 'text-emerald-600' : 'text-red-600'}">{form.profile.message}</p>
			{/if}

			<div class="flex justify-end gap-2">
				<button
					type="button"
					onclick={resetProfile}
					disabled={!profileDirty || pending === 'profile'}
					class="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
				>
					되돌리기
				</button>
				<button
					disabled={!profileDirty || !nameOk || !phoneOk || pending === 'profile'}
					class="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
				>
					{pending === 'profile' ? '저장 중…' : '저장'}
				</button>
			</div>
		</form>
	</section>

	<!-- 비밀번호 변경 -->
	<section class="rounded-xl bg-white p-6 shadow-sm">
		<h2 class="font-semibold text-slate-900">비밀번호 변경</h2>

		<form
			method="POST"
			action="?/changePassword"
			use:enhance={submitting('password', true)}
			class="mt-4 space-y-4"
		>
			<label class="block">
				<span class="text-sm font-medium text-slate-700">현재 비밀번호</span>
				<input
					name="currentPassword"
					type="password"
					autocomplete="current-password"
					required
					class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-sm font-medium text-slate-700">
					새 비밀번호 <span class="text-slate-400">({MIN_PASSWORD_LENGTH}자 이상)</span>
				</span>
				<input
					name="newPassword"
					type="password"
					autocomplete="new-password"
					minlength={MIN_PASSWORD_LENGTH}
					required
					class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-sm font-medium text-slate-700">새 비밀번호 확인</span>
				<input
					name="newPasswordConfirm"
					type="password"
					autocomplete="new-password"
					minlength={MIN_PASSWORD_LENGTH}
					required
					class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
				/>
			</label>

			{#if form?.password?.message}
				<p class="text-sm {form.password.success ? 'text-emerald-600' : 'text-red-600'}">{form.password.message}</p>
			{/if}

			<div class="flex justify-end">
				<button
					disabled={pending === 'password'}
					class="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
				>
					{pending === 'password' ? '변경 중…' : '비밀번호 변경'}
				</button>
			</div>
		</form>
	</section>

	<!-- 약관 동의 내역 -->
	<section class="rounded-xl bg-white p-6 shadow-sm">
		<h2 class="font-semibold text-slate-900">약관 동의 내역</h2>

		{#if data.consents.length === 0}
			<p class="mt-4 text-sm text-slate-500">동의 내역이 없습니다.</p>
		{:else}
			<ul class="mt-4 divide-y divide-slate-100">
				{#each data.consents as consent (consent.id)}
					{@const doc = consent.policy_documents}
					<li class="py-3">
						<div class="flex flex-wrap items-center gap-2 text-sm">
							<span class="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
								{DOCUMENT_TYPE_LABELS[doc.type] ?? doc.type}
							</span>
							<span class="font-medium text-slate-800">{doc.title}</span>
							<span class="text-xs text-slate-400">시행 {doc.version}</span>
							{#if !doc.is_current}
								<span class="text-xs text-amber-600">이전 버전</span>
							{/if}
							<span class="ml-auto text-xs text-slate-500">{formatDateTime(consent.agreed_at)} 동의</span>
						</div>
						<details class="mt-2">
							<summary class="cursor-pointer text-xs text-slate-500">동의한 전문 보기</summary>
							<div class="mt-2 max-h-48 overflow-y-auto rounded-lg bg-slate-50 p-3 text-xs leading-relaxed whitespace-pre-line text-slate-600">
								{doc.content}
							</div>
						</details>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- 회원 탈퇴 -->
	<section class="rounded-xl border border-red-200 bg-white p-6 shadow-sm">
		<h2 class="font-semibold text-red-700">회원 탈퇴</h2>
		<p class="mt-2 text-sm text-slate-600">
			탈퇴하면 회원 정보, 회화 기록, 저장한 프롬프트, 약관 동의 내역이 <strong>모두 즉시 삭제되며 복구할 수 없습니다.</strong>
		</p>

		{#if !deleteOpen}
			<div class="mt-4 flex justify-end">
				<button
					type="button"
					onclick={() => (deleteOpen = true)}
					class="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
				>
					탈퇴하기
				</button>
			</div>
		{:else}
			<form method="POST" action="?/deleteAccount" use:enhance={submitting('deletion', false)} class="mt-4 space-y-4">
				<label class="block">
					<span class="text-sm font-medium text-slate-700">비밀번호</span>
					<input
						name="password"
						type="password"
						autocomplete="current-password"
						required
						class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
					/>
				</label>
				<label class="block">
					<span class="text-sm font-medium text-slate-700">
						확인을 위해 <strong class="text-red-600">{DELETE_CONFIRM_TEXT}</strong>를 입력하세요
					</span>
					<input
						name="confirmText"
						autocomplete="off"
						required
						bind:value={deleteConfirmText}
						class="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
					/>
				</label>

				{#if form?.deletion?.message}
					<p class="text-sm text-red-600">{form.deletion.message}</p>
				{/if}

				<div class="flex justify-end gap-2">
					<button
						type="button"
						onclick={() => {
							deleteOpen = false;
							deleteConfirmText = '';
						}}
						disabled={pending === 'deletion'}
						class="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
					>
						취소
					</button>
					<button
						disabled={deleteConfirmText.trim() !== DELETE_CONFIRM_TEXT || pending === 'deletion'}
						class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
					>
						{pending === 'deletion' ? '탈퇴 처리 중…' : '영구 탈퇴'}
					</button>
				</div>
			</form>
		{/if}
	</section>
</div>
