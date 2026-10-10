// src/routes/signup/+page.server.js
import { fail, redirect } from '@sveltejs/kit';
import { authErrorMessage } from '#lib/server/auth-errors.js';
import { MIN_PASSWORD_LENGTH } from '#lib/auth.js';

export async function load({ locals }) {
	if (await locals.getUser()) redirect(303, '/');
}

export const actions = {
	default: async ({ request, locals, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');
		const passwordConfirm = String(form.get('passwordConfirm') ?? '');

		if (!email || !password) {
			return fail(400, { email, message: '이메일과 비밀번호를 입력하세요.' });
		}
		if (password.length < MIN_PASSWORD_LENGTH) {
			return fail(400, { email, message: `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.` });
		}
		if (password !== passwordConfirm) {
			return fail(400, { email, message: '비밀번호 확인이 일치하지 않습니다.' });
		}
		if (!locals.supabase) {
			return fail(500, { email, message: 'Supabase 환경변수가 설정되지 않았습니다.' });
		}

		const { data, error } = await locals.supabase.auth.signUp({
			email,
			password,
			// 인증 메일의 링크를 누르면 이 주소로 돌아와 세션을 만든다
			options: { emailRedirectTo: `${url.origin}/auth/callback` }
		});
		if (error) return fail(400, { email, message: authErrorMessage(error) });

		// 이메일 인증이 꺼져 있으면 바로 세션이 생기므로 로그인 상태로 이동한다
		if (data.session) redirect(303, '/');

		return { email, sent: true };
	}
};
