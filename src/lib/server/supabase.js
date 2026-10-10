// src/lib/server/supabase.js
import { error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { SUPABASE_DB_URL, SUPABASE_DB_PUBLIC_KEY } from '$app/env/private';

/** @type {import('@supabase/supabase-js').SupabaseClient | undefined} */
let client;

export const isSupabaseConfigured = Boolean(SUPABASE_DB_URL && SUPABASE_DB_PUBLIC_KEY);

function assertConfigured() {
	if (!isSupabaseConfigured) {
		error(500, 'SUPABASE_DB_URL / SUPABASE_DB_PUBLIC_KEY가 설정되지 않았습니다. .env 파일을 확인하세요.');
	}
}

/** 세션 없이 anon 권한으로 쓰는 서버 전용 Supabase 클라이언트 */
export function getSupabase() {
	assertConfigured();
	client ??= createClient(/** @type {string} */ (SUPABASE_DB_URL), /** @type {string} */ (SUPABASE_DB_PUBLIC_KEY), {
		auth: { persistSession: false }
	});
	return client;
}

/**
 * 요청마다 만드는 Supabase 클라이언트. 로그인 세션을 쿠키에 읽고 쓴다.
 * @param {import('@sveltejs/kit').Cookies} cookies
 */
export function createRequestSupabase(cookies) {
	assertConfigured();
	return createServerClient(/** @type {string} */ (SUPABASE_DB_URL), /** @type {string} */ (SUPABASE_DB_PUBLIC_KEY), {
		cookies: {
			getAll: () => cookies.getAll(),
			setAll: (cookiesToSet) => {
				for (const { name, value, options } of cookiesToSet) {
					cookies.set(name, value, { ...options, path: '/' });
				}
			}
		}
	});
}
