// src/lib/server/access.js

/** 로그인하지 않아도 접근할 수 있는 경로. '/' 로 끝나면 그 아래 전체 */
const PUBLIC_PATHS = ['/login', '/signup', '/logout', '/auth/'];

/** 로그인 후 온보딩(이름·전화번호·약관 동의)을 마치지 않아도 접근할 수 있는 경로 */
const ONBOARDING_EXEMPT_PATHS = ['/onboarding', '/logout', '/auth/'];

/** @param {string[]} paths @param {string} pathname */
function matches(paths, pathname) {
	return paths.some((p) => (p.endsWith('/') ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`)));
}

/** @param {string} pathname */
export const isPublicPath = (pathname) => pathname.startsWith('/_app/') || matches(PUBLIC_PATHS, pathname);

/** @param {string} pathname */
export const isOnboardingExempt = (pathname) => matches(ONBOARDING_EXEMPT_PATHS, pathname);

/** 로그인·온보딩 후 돌아갈 주소. 다른 사이트로 보내지 않도록 같은 사이트 경로만 허용한다 @param {string | null} next */
export function safeNextPath(next) {
	return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}
