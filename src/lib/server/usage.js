// src/lib/server/usage.js
// Live API 사용량(usageMetadata)을 live_usage_events 행으로 바꾼다. 관리자 페이지는 usage_rollup 함수로 이 테이블을 집계한다
import { error } from '@sveltejs/kit';

/** 한 값의 상한 (비정상 요청 방지) */
const MAX_TOKENS = 100_000_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** @param {unknown} v */
function count(v) {
	const n = Number(v ?? 0);
	if (!Number.isInteger(n) || n < 0 || n > MAX_TOKENS) error(400, '토큰 수가 올바르지 않습니다.');
	return n;
}

/**
 * 모달리티별 토큰 수를 합친다. IMAGE 는 영상 입력 요금으로 계산하므로 video 에 더한다
 * @param {unknown} details [{ modality, tokenCount }]
 */
function byModality(details) {
	const out = { text: 0, audio: 0, video: 0 };
	if (!Array.isArray(details)) return out;
	for (const d of details) {
		const modality = String(d?.modality ?? '').toUpperCase();
		const key = modality === 'TEXT' ? 'text' : modality === 'AUDIO' ? 'audio' : modality === 'VIDEO' || modality === 'IMAGE' ? 'video' : null;
		if (key) out[key] += count(d?.tokenCount);
	}
	return out;
}

/**
 * 클라이언트가 전달한 usageMetadata 를 live_usage_events 행으로 바꾼다
 * @param {unknown} usage Live API 서버 메시지의 usageMetadata (wire 포맷, camelCase)
 * @param {{ userId: string, conversationId: unknown, model: string }} meta
 */
export function toUsageRow(usage, { userId, conversationId, model }) {
	if (!usage || typeof usage !== 'object') error(400, 'usage 객체가 필요합니다.');
	const u = /** @type {Record<string, unknown>} */ (usage);
	const input = byModality(u.promptTokensDetails);
	const output = byModality(u.responseTokensDetails);

	return {
		user_id: userId,
		conversation_id: typeof conversationId === 'string' && UUID_RE.test(conversationId) ? conversationId : null,
		model,
		prompt_tokens: count(u.promptTokenCount),
		response_tokens: count(u.responseTokenCount),
		thoughts_tokens: count(u.thoughtsTokenCount),
		total_tokens: count(u.totalTokenCount),
		input_text_tokens: input.text,
		input_audio_tokens: input.audio,
		input_video_tokens: input.video,
		output_text_tokens: output.text,
		output_audio_tokens: output.audio,
		raw: usage
	};
}
