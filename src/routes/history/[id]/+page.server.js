// src/routes/history/[id]/+page.server.js
import { error, fail, redirect } from '@sveltejs/kit';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 회화 1회와 그 메시지(자막·시스템 메시지)를 순서대로 불러온다. 다른 사용자의 회화는 RLS로 조회되지 않아 404가 된다 */
export async function load({ params, locals }) {
	const user = await locals.getUser();
	if (!user || !locals.supabase) redirect(303, '/login');
	if (!UUID_RE.test(params.id)) error(404, '회화 기록을 찾을 수 없습니다.');

	const { data, error: loadError } = await locals.supabase
		.from('conversations')
		.select(
			'id, title, started_at, ended_at, end_reason, model, tutor_settings, system_prompt, custom_prompt:custom_prompts(id, title), conversation_messages(seq, role, content, interrupted, created_at)'
		)
		.eq('id', params.id)
		.order('seq', { referencedTable: 'conversation_messages', ascending: true })
		.maybeSingle();
	if (loadError) error(500, `회화 기록 조회 실패: ${loadError.message}`);
	if (!data) error(404, '회화 기록을 찾을 수 없습니다.');

	const { conversation_messages, ...conversation } = data;
	return { conversation, messages: conversation_messages };
}

export const actions = {
	delete: async ({ params, locals }) => {
		if (!locals.supabase) return fail(500, { message: 'Supabase 환경변수가 설정되지 않았습니다.' });

		const { error: deleteError } = await locals.supabase.from('conversations').delete().eq('id', params.id);
		if (deleteError) return fail(500, { message: `삭제 실패: ${deleteError.message}` });

		redirect(303, '/history');
	}
};
