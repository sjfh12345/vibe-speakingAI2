// src/routes/auth/callback/+server.js
import { redirect } from '@sveltejs/kit';

/** 인증 메일 링크로 돌아왔을 때 code를 세션으로 교환한다 */
export async function GET({ url, locals }) {
	const code = url.searchParams.get('code');

	if (code && locals.supabase) {
		const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
		if (!error) redirect(303, '/');
	}

	redirect(303, '/login?error=confirm');
}
