// src/routes/+layout.server.js

/** 모든 페이지에서 로그인 상태를 알 수 있도록 사용자 이메일·이름을 내려준다 */
export async function load({ locals }) {
	const user = await locals.getUser();
	if (!user) return { user: null };

	const onboarding = await locals.getOnboarding();
	return { user: { id: user.id, email: user.email, name: onboarding?.profile?.full_name ?? null } };
}
