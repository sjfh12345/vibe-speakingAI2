// src/routes/api/conversations/+server.js
import { json, error } from '@sveltejs/kit';
import { LIVE_MODEL } from '#lib/live/config.js';
import { buildSystemPrompt, normalizeTutorSettings } from '#lib/live/tutor-prompt.js';
import { requireSupabase, parseDate } from '#lib/server/conversations.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 음성 대화가 시작될 때 회화 세션 1개를 만든다.
 * 튜터 지시문은 프롬프트 원문이 아닌 설정값을 받아, 토큰 발급과 같은 함수로 서버에서 만든다.
 * body: { startedAt (ms 타임스탬프), settings, customPromptId? }
 */
export async function POST({ request, locals }) {
	const supabase = await requireSupabase(locals);
	const body = await request.json().catch(() => null);
	const startedAt = parseDate(body?.startedAt) ?? new Date();
	// 허용된 값으로 정리한 설정을 저장하고, 같은 값으로 만든 프롬프트 원문도 함께 남긴다
	const settings = normalizeTutorSettings(body?.settings);

	// 저장 프롬프트 연결: 본인 프롬프트인지 확인한다 (RLS로 남의 것은 조회되지 않음)
	let customPromptId = null;
	if (typeof body?.customPromptId === 'string' && UUID_RE.test(body.customPromptId)) {
		const { data: prompt } = await supabase
			.from('custom_prompts')
			.select('id')
			.eq('id', body.customPromptId)
			.maybeSingle();
		customPromptId = prompt?.id ?? null;
	}

	const { data, error: insertError } = await supabase
		.from('conversations')
		.insert({
			started_at: startedAt.toISOString(),
			model: LIVE_MODEL,
			tutor_settings: settings,
			system_prompt: buildSystemPrompt(settings),
			// 연결할 프롬프트가 있을 때만 넣는다 (custom_prompts SQL 적용 전에도 기록 저장은 되도록)
			...(customPromptId && { custom_prompt_id: customPromptId })
		})
		.select('id')
		.single();
	if (insertError) error(500, `회화 세션 생성 실패: ${insertError.message}`);

	return json({ id: data.id }, { status: 201 });
}
