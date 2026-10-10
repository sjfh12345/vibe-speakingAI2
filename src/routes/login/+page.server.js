// src/routes/login/+page.server.js
import { fail, redirect } from '@sveltejs/kit';
import { authErrorMessage } from '#lib/server/auth-errors.js';
import { safeNextPath } from '#lib/server/access.js';

export async function load({ locals, url }) {
	if (await locals.getUser()) redirect(303, safeNextPath(url.searchParams.get('next')));
}

export const actions = {
	default: async ({ request, locals, url }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim();
		const password = String(form.get('password') ?? '');

		if (!email || !password) {
			return fail(400, { email, message: '이메일과 비밀번호를 입력하세요.' });
		}
		if (!locals.supabase) {
			return fail(500, { email, message: 'Supabase 환경변수가 설정되지 않았습니다.' });
		}

		const { error } = await locals.supabase.auth.signInWithPassword({ email, password });
		if (error) return fail(400, { email, message: authErrorMessage(error) });

		// 로그인이 필요해 이동해 왔다면 원래 가려던 페이지로 돌려보낸다
		redirect(303, safeNextPath(url.searchParams.get('next')));
	}
};
