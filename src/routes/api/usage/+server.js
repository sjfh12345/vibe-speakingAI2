// src/routes/api/usage/+server.js
import { json, error } from '@sveltejs/kit';
import { LIVE_MODEL } from '#lib/live/config.js';
import { toUsageRow } from '#lib/server/usage.js';

/**
 * Live 세션에서 받은 사용량(usageMetadata) 1건을 저장한다. 로그인한 사용자만 기록된다.
 * 모델은 클라이언트 값을 믿지 않고 서버가 토큰을 발급한 모델로 기록한다.
 * body: { usage, conversationId? }
 */
export async function POST({ request, locals }) {
	const user = await locals.getUser();
	if (!user || !locals.supabase) error(401, '로그인해야 사용량을 기록할 수 있습니다.');

	const body = await request.json().catch(() => null);
	const row = toUsageRow(body?.usage, { userId: user.id, conversationId: body?.conversationId, model: LIVE_MODEL });

	const { error: insertError } = await locals.supabase.from('live_usage_events').insert(row);
	if (insertError) error(500, `사용량 저장 실패: ${insertError.message}`);

	return json({ saved: 1 });
}
