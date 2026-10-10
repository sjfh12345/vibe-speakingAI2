// src/routes/db-test/+page.server.js
import { fail } from '@sveltejs/kit';
import { getSupabase } from '#lib/server/supabase.js';

/** test_messages 테이블의 최근 행을 불러온다 */
export async function load() {
	const started = Date.now();
	const { data, error } = await getSupabase()
		.from('test_messages')
		.select('id, content, created_at')
		.order('created_at', { ascending: false })
		.limit(20);

	return {
		messages: data ?? [],
		loadError: error?.message ?? null,
		latencyMs: Date.now() - started
	};
}

export const actions = {
	create: async ({ request }) => {
		const content = String((await request.formData()).get('content') ?? '').trim();
		if (!content) return fail(400, { message: '내용을 입력하세요.' });

		const { error } = await getSupabase().from('test_messages').insert({ content });
		if (error) return fail(500, { message: `저장 실패: ${error.message}` });
		return { message: '저장했습니다.' };
	},

	delete: async ({ request }) => {
		const id = Number((await request.formData()).get('id'));
		const { error } = await getSupabase().from('test_messages').delete().eq('id', id);
		if (error) return fail(500, { message: `삭제 실패: ${error.message}` });
		return { message: '삭제했습니다.' };
	}
};
