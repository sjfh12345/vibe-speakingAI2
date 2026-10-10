// src/hooks.server.js
import { json, redirect } from '@sveltejs/kit';
import { createRequestSupabase, isSupabaseConfigured } from '#lib/server/supabase.js';
import { getOnboardingStatus } from '#lib/server/onboarding.js';
import { isOnboardingExempt, isPublicPath } from '#lib/server/access.js';

/** @type {import('@sveltejs/kit/hooks').Handle} */
export async function handle({ event, resolve }) {
	// Supabase 설정이 없어도 회화·녹음 페이지는 동작하도록 클라이언트를 만들지 않는다
	if (isSupabaseConfigured) {
		event.locals.supabase = createRequestSupabase(event.cookies);
	}

	// hook·layout·page 에서 여러 번 불러도 요청당 한 번만 조회한다
	/** @type {Promise<import('@supabase/supabase-js').User | null> | undefined} */
	let userPromise;
	/** @type {Promise<import('#lib/server/onboarding.js').OnboardingStatus | null> | undefined} */
	let onboardingPromise;

	/** 쿠키의 세션을 Supabase 서버에 검증한 뒤 사용자 정보를 돌려준다 */
	event.locals.getUser = () =>
		(userPromise ??= (async () => {
			if (!event.locals.supabase) return null;
			const { data, error } = await event.locals.supabase.auth.getUser();
			return error ? null : data.user;
		})());

	/** 로그인 사용자의 온보딩(이름·전화번호·약관 동의) 상태. 로그아웃 상태면 null */
	event.locals.getOnboarding = () =>
		(onboardingPromise ??= (async () => {
			const user = await event.locals.getUser();
			if (!user || !event.locals.supabase) return null;
			return getOnboardingStatus(event.locals.supabase, user.id);
		})());

	const { pathname, search } = event.url;
	const next = encodeURIComponent(pathname + search);

	// 로그인·회원가입 화면 외에는 모두 로그인해야 쓸 수 있다
	if (!isPublicPath(pathname) && !(await event.locals.getUser())) {
		if (pathname.startsWith('/api/')) {
			return json({ message: '로그인이 필요합니다.' }, { status: 401 });
		}
		redirect(303, pathname === '/' ? '/login' : `/login?next=${next}`);
	}

	// 최초 로그인 후 이름·전화번호 입력과 필수 약관 동의를 마치기 전에는 온보딩 화면으로 보낸다
	if (!isPublicPath(pathname) && !isOnboardingExempt(pathname)) {
		const status = await event.locals.getOnboarding();
		if (status?.error) console.warn('[onboarding] 상태 조회 실패:', status.error);
		if (status?.required) {
			if (pathname.startsWith('/api/')) {
				return json({ message: '이용약관 동의와 회원 정보 입력을 먼저 완료하세요.' }, { status: 403 });
			}
			redirect(303, `/onboarding?next=${next}`);
		}
	}

	return resolve(event, {
		filterSerializedResponseHeaders: (name) =>
			name === 'content-range' || name === 'x-supabase-api-version'
	});
}
