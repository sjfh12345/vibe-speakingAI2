// src/routes/account/+page.server.js
import { error, fail, redirect } from '@sveltejs/kit';
import { DELETE_CONFIRM_TEXT, MIN_PASSWORD_LENGTH, NAME_MAX_LENGTH, PHONE_RE, normalizePhone } from '#lib/auth.js';
import { authErrorMessage } from '#lib/server/auth-errors.js';

/** 로그인한 사용자 본인의 회원 정보와 약관 동의 내역 (RLS로 본인 것만 조회됨) */
export async function load({ locals }) {
	const user = await locals.getUser();
	if (!user || !locals.supabase) redirect(303, '/login');

	const [profile, consents] = await Promise.all([
		locals.supabase
			.from('profiles')
			.select('email, full_name, phone, created_at, onboarded_at')
			.eq('id', user.id)
			.single(),
		locals.supabase
			.from('user_consents')
			.select('id, agreed_at, policy_documents(type, version, title, content, is_current)')
			.order('agreed_at', { ascending: false })
	]);
	if (profile.error) error(500, `회원 정보 조회 실패: ${profile.error.message}`);
	if (consents.error) error(500, `동의 내역 조회 실패: ${consents.error.message}`);

	return {
		profile: { ...profile.data, email: user.email ?? profile.data.email },
		lastSignInAt: user.last_sign_in_at ?? null,
		consents: consents.data
	};
}

/** @param {App.Locals} locals */
async function requireUser(locals) {
	const user = await locals.getUser();
	if (!user || !locals.supabase) redirect(303, '/login');
	return { user, supabase: locals.supabase };
}

export const actions = {
	updateProfile: async ({ request, locals }) => {
		const { user, supabase } = await requireUser(locals);

		const form = await request.formData();
		const fullName = String(form.get('fullName') ?? '').trim();
		const phone = normalizePhone(form.get('phone'));

		const values = { fullName, phone };
		if (!fullName || fullName.length > NAME_MAX_LENGTH) {
			return fail(400, { profile: { ...values, message: `이름을 1~${NAME_MAX_LENGTH}자로 입력하세요.` } });
		}
		if (!PHONE_RE.test(phone)) {
			return fail(400, {
				profile: { ...values, message: '휴대전화 번호를 정확히 입력하세요. (예: 010-1234-5678)' }
			});
		}

		const { error: updateError } = await supabase
			.from('profiles')
			.update({ full_name: fullName, phone })
			.eq('id', user.id);
		if (updateError) return fail(500, { profile: { ...values, message: `저장 실패: ${updateError.message}` } });

		return { profile: { ...values, success: true, message: '회원 정보를 저장했습니다.' } };
	},

	changePassword: async ({ request, locals }) => {
		const { user, supabase } = await requireUser(locals);

		const form = await request.formData();
		const currentPassword = String(form.get('currentPassword') ?? '');
		const newPassword = String(form.get('newPassword') ?? '');
		const newPasswordConfirm = String(form.get('newPasswordConfirm') ?? '');

		if (!currentPassword || !newPassword) {
			return fail(400, { password: { message: '현재 비밀번호와 새 비밀번호를 입력하세요.' } });
		}
		if (newPassword.length < MIN_PASSWORD_LENGTH) {
			return fail(400, { password: { message: `새 비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.` } });
		}
		if (newPassword !== newPasswordConfirm) {
			return fail(400, { password: { message: '새 비밀번호 확인이 일치하지 않습니다.' } });
		}
		if (newPassword === currentPassword) {
			return fail(400, { password: { message: '현재 비밀번호와 다른 비밀번호를 입력하세요.' } });
		}

		// 세션을 탈취당한 경우를 막기 위해 현재 비밀번호를 한 번 더 확인한다
		const { error: verifyError } = await supabase.auth.signInWithPassword({
			email: /** @type {string} */ (user.email),
			password: currentPassword
		});
		if (verifyError) return fail(400, { password: { message: '현재 비밀번호가 올바르지 않습니다.' } });

		const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
		if (updateError) return fail(400, { password: { message: authErrorMessage(updateError) } });

		return { password: { success: true, message: '비밀번호를 변경했습니다.' } };
	},

	/** 회원 탈퇴: 비밀번호와 확인 문구를 검증한 뒤 계정과 모든 데이터를 삭제한다 */
	deleteAccount: async ({ request, locals }) => {
		const { user, supabase } = await requireUser(locals);

		const form = await request.formData();
		const password = String(form.get('password') ?? '');
		const confirmText = String(form.get('confirmText') ?? '').trim();

		if (confirmText !== DELETE_CONFIRM_TEXT) {
			return fail(400, { deletion: { message: `확인 문구 '${DELETE_CONFIRM_TEXT}'를 정확히 입력하세요.` } });
		}
		if (!password) return fail(400, { deletion: { message: '비밀번호를 입력하세요.' } });

		const { error: verifyError } = await supabase.auth.signInWithPassword({
			email: /** @type {string} */ (user.email),
			password
		});
		if (verifyError) return fail(400, { deletion: { message: '비밀번호가 올바르지 않습니다.' } });

		const { error: deleteError } = await supabase.rpc('delete_my_account');
		if (deleteError) return fail(500, { deletion: { message: `탈퇴 처리 실패: ${deleteError.message}` } });

		// 계정이 이미 지워졌으므로 서버 요청 없이 이 브라우저의 세션 쿠키만 지운다
		await supabase.auth.signOut({ scope: 'local' });
		redirect(303, '/login?deleted=1');
	}
};
