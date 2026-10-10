// src/routes/api/conversations/[id]/+server.js
import { json, error } from '@sveltejs/kit';
import { requireSupabase, parseDate, toMessageRows, END_REASONS } from '#lib/server/conversations.js';

const TITLE_LENGTH = 60;

/**
 * 회화 세션을 마감한다: 남은 메시지를 저장하고 종료 시각·사유·제목을 기록한다.
 * 페이지를 떠날 때도 한 번의 요청으로 끝나도록 메시지와 마감을 함께 받는다.
 * body: { endedAt, endReason, title?, messages: [{ seq, role, text, interrupted? }] }
 */
export async function PATCH({ params, request, locals }) {
	const supabase = await requireSupabase(locals);
	const body = await request.json().catch(() => null);
	const endedAt = parseDate(body?.endedAt) ?? new Date();
	const endReason = END_REASONS.includes(body?.endReason) ? body.endReason : null;
	const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim().slice(0, TITLE_LENGTH) : null;

	const rows = toMessageRows(params.id, body?.messages ?? []);
	if (rows.length > 0) {
		const { error: insertError } = await supabase.from('conversation_messages').insert(rows);
		if (insertError) error(500, `메시지 저장 실패: ${insertError.message}`);
	}

	const { data, error: updateError } = await supabase
		.from('conversations')
		.update({ ended_at: endedAt.toISOString(), end_reason: endReason, ...(title && { title }) })
		.eq('id', params.id)
		.select('id');
	if (updateError) error(500, `회화 마감 실패: ${updateError.message}`);
	if (data.length === 0) error(404, '회화 기록을 찾을 수 없습니다.');

	return json({ id: params.id });
}

/** 학습자·튜터 발화가 하나도 없이 끝난 세션을 지운다 */
export async function DELETE({ params, locals }) {
	const supabase = await requireSupabase(locals);
	const { error: deleteError } = await supabase.from('conversations').delete().eq('id', params.id);
	if (deleteError) error(500, `회화 삭제 실패: ${deleteError.message}`);
	return new Response(null, { status: 204 });
}
