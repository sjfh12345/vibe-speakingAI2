// src/routes/api/conversations/[id]/messages/+server.js
import { json, error } from '@sveltejs/kit';
import { requireSupabase, toMessageRows } from '#lib/server/conversations.js';

/**
 * 진행 중인 회화 세션에 끝난 메시지를 이어서 저장한다 (턴이 끝날 때마다 호출).
 * 다른 사용자의 세션에는 RLS 때문에 저장되지 않는다.
 * body: { messages: [{ seq, role, text, interrupted? }] }
 */
export async function POST({ params, request, locals }) {
	const supabase = await requireSupabase(locals);
	const body = await request.json().catch(() => null);
	const rows = toMessageRows(params.id, body?.messages);
	if (rows.length === 0) return json({ saved: 0 });

	const { error: insertError } = await supabase.from('conversation_messages').insert(rows);
	if (insertError) error(500, `메시지 저장 실패: ${insertError.message}`);

	return json({ saved: rows.length });
}
