// src/lib/server/conversations.js
import { error } from '@sveltejs/kit';

/** 한 요청에 저장할 수 있는 최대 메시지 수 (비정상 요청 방지) */
const MAX_MESSAGES = 2000;
const ROLES = ['user', 'ai', 'system'];
export const END_REASONS = ['user', 'server', 'error', 'leave'];

/**
 * 회화 API 공통: 로그인 사용자와 세션 클라이언트를 확인한다
 * @param {App.Locals} locals
 */
export async function requireSupabase(locals) {
	const user = await locals.getUser();
	if (!user || !locals.supabase) error(401, '로그인해야 회화 기록을 저장할 수 있습니다.');
	return locals.supabase;
}

/** 타임스탬프(ms) 숫자 또는 ISO 문자열 @param {unknown} value */
export function parseDate(value) {
	if (value == null) return null;
	const d = new Date(typeof value === 'number' ? value : String(value));
	return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 클라이언트가 보낸 메시지를 conversation_messages 행으로 바꾼다
 * @param {string} conversationId
 * @param {unknown} list [{ seq, role, text, interrupted? }]
 */
export function toMessageRows(conversationId, list) {
	if (!Array.isArray(list)) error(400, 'messages 배열이 필요합니다.');
	if (list.length > MAX_MESSAGES) error(400, '메시지가 너무 많습니다.');

	return list
		.filter(
			(m) =>
				Number.isInteger(m?.seq) &&
				m.seq >= 0 &&
				ROLES.includes(m.role) &&
				typeof m.text === 'string' &&
				m.text.trim()
		)
		.map((m) => ({
			conversation_id: conversationId,
			seq: m.seq,
			role: m.role,
			content: m.text.trim(),
			interrupted: Boolean(m.interrupted)
		}));
}
