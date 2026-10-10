// src/routes/history/+page.server.js
import { error, redirect } from '@sveltejs/kit';

/** 목록에 한 번에 보여 줄 최대 회화 수 */
const PAGE_SIZE = 100;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** 로그인한 사용자의 회화 기록과 사용 통계를 불러온다 (RLS로 본인 것만 조회됨) */
export async function load({ locals }) {
	const user = await locals.getUser();
	if (!user || !locals.supabase) redirect(303, '/login');

	const [list, usage] = await Promise.all([
		locals.supabase
			.from('conversations')
			.select('id, title, started_at, ended_at, end_reason, tutor_settings, conversation_messages(count)')
			// 메시지 수는 학습자·튜터 발화만 센다 (시스템 메시지 제외)
			.in('conversation_messages.role', ['user', 'ai'])
			.order('started_at', { ascending: false })
			.limit(PAGE_SIZE),
		// 사용 통계는 목록 개수 제한과 별개로 전체 세션 기준으로 계산한다
		locals.supabase.from('conversations').select('started_at, ended_at')
	]);
	if (list.error) error(500, `회화 기록 조회 실패: ${list.error.message}`);
	if (usage.error) error(500, `사용 기록 조회 실패: ${usage.error.message}`);

	const weekAgo = Date.now() - WEEK_MS;
	let totalSec = 0;
	let weekSec = 0;
	let weekCount = 0;
	for (const c of usage.data) {
		const start = new Date(c.started_at).getTime();
		const sec = c.ended_at ? Math.max(0, (new Date(c.ended_at).getTime() - start) / 1000) : 0;
		totalSec += sec;
		if (start >= weekAgo) {
			weekSec += sec;
			weekCount++;
		}
	}

	return {
		conversations: list.data.map(({ conversation_messages, ...c }) => ({
			...c,
			messageCount: conversation_messages[0]?.count ?? 0
		})),
		usage: { totalCount: usage.data.length, totalSec, weekCount, weekSec }
	};
}
