// src/lib/server/onboarding.js

/**
 * @typedef {{ id: string, type: string, version: string, title: string, content: string }} PolicyDocument
 * @typedef {{
 *   required: boolean,
 *   profile: { full_name: string | null, phone: string | null } | null,
 *   pendingDocuments: PolicyDocument[],
 *   error: string | null
 * }} OnboardingStatus
 */

/**
 * 이름·전화번호 입력과 현재 버전 필수 약관 동의를 마쳤는지 확인한다
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @returns {Promise<OnboardingStatus>}
 */
export async function getOnboardingStatus(supabase, userId) {
	const [profile, pending] = await Promise.all([
		supabase.from('profiles').select('full_name, phone').eq('id', userId).maybeSingle(),
		supabase.rpc('pending_policy_documents').select('id, type, version, title, content')
	]);

	// 마이그레이션 전이라 테이블·함수가 없으면 서비스를 막지 않고 에러만 알린다
	const error = profile.error?.message ?? pending.error?.message ?? null;
	if (error) return { required: false, profile: null, pendingDocuments: [], error };

	const pendingDocuments = /** @type {PolicyDocument[]} */ (pending.data ?? []);
	const required = !profile.data?.full_name || !profile.data?.phone || pendingDocuments.length > 0;
	return { required, profile: profile.data, pendingDocuments, error: null };
}
