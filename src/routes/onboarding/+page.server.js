// src/routes/onboarding/+page.server.js
import { error, fail, redirect } from '@sveltejs/kit';
import { NAME_MAX_LENGTH, PHONE_RE, normalizePhone } from '#lib/auth.js';
import { safeNextPath } from '#lib/server/access.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 최초 로그인(또는 약관 개정) 시 이름·전화번호 입력과 약관 동의를 받는다 */
export async function load({ locals, url }) {
	const user = await locals.getUser();
	if (!user || !locals.supabase) redirect(303, '/login');

	const next = safeNextPath(url.searchParams.get('next'));
	const status = await locals.getOnboarding();
	if (status?.error) error(500, `회원 정보 조회 실패: ${status.error}`);
	if (!status?.required) redirect(303, next);

	return {
		email: user.email,
		fullName: status.profile?.full_name ?? '',
		phone: status.profile?.phone ?? '',
		documents: status.pendingDocuments,
		next
	};
}

export const actions = {
	default: async ({ request, locals, url, getClientAddress }) => {
		const user = await locals.getUser();
		if (!user || !locals.supabase) redirect(303, '/login');

		const form = await request.formData();
		const fullName = String(form.get('fullName') ?? '').trim();
		const phone = normalizePhone(form.get('phone'));
		const agreed = form
			.getAll('agree')
			.map(String)
			.filter((id) => UUID_RE.test(id));

		const values = { fullName, phone };
		if (!fullName || fullName.length > NAME_MAX_LENGTH) {
			return fail(400, { ...values, message: `이름을 1~${NAME_MAX_LENGTH}자로 입력하세요.` });
		}
		if (!PHONE_RE.test(phone)) {
			return fail(400, { ...values, message: '휴대전화 번호를 정확히 입력하세요. (예: 010-1234-5678)' });
		}

		const status = await locals.getOnboarding();
		if (status?.pendingDocuments.some((d) => !agreed.includes(d.id))) {
			return fail(400, { ...values, message: '필수 약관에 모두 동의해야 서비스를 이용할 수 있습니다.' });
		}

		let ip = null;
		try {
			ip = getClientAddress();
		} catch {
			// 어댑터가 접속 IP 를 제공하지 않으면 기록하지 않는다
		}

		const { error: rpcError } = await locals.supabase.rpc('complete_onboarding', {
			p_full_name: fullName,
			p_phone: phone,
			p_document_ids: agreed,
			p_ip_address: ip,
			p_user_agent: request.headers.get('user-agent')
		});
		if (rpcError) return fail(400, { ...values, message: `저장 실패: ${rpcError.message}` });

		redirect(303, safeNextPath(url.searchParams.get('next')));
	}
};
