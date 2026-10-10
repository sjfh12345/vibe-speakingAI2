// src/routes/+page.server.js
import { fail } from '@sveltejs/kit';
import { normalizeCustomPrompt } from '#lib/live/tutor-prompt.js';

/** 사용자당 저장할 수 있는 커스텀 프롬프트 수 */
const MAX_CUSTOM_PROMPTS = 30;
const TITLE_MAX_LENGTH = 30;

/** 로그인한 사용자가 저장해 둔 커스텀 프롬프트를 불러온다 (RLS로 본인 것만 조회됨) */
export async function load({ locals }) {
	const user = await locals.getUser();
	if (!user || !locals.supabase) return { customPrompts: [], customPromptsError: null };

	const { data, error } = await locals.supabase
		.from('custom_prompts')
		.select('id, title, content, updated_at')
		.order('updated_at', { ascending: false });

	// 테이블이 아직 없어도 회화는 할 수 있도록 에러만 알려 준다
	return { customPrompts: data ?? [], customPromptsError: error?.message ?? null };
}

/** @param {App.Locals} locals */
async function requireSupabase(locals) {
	const user = await locals.getUser();
	return user && locals.supabase ? locals.supabase : null;
}

export const actions = {
	/** 새 프롬프트로 저장하거나(id 없음) 기존 프롬프트를 덮어쓴다(id 있음) */
	saveCustomPrompt: async ({ request, locals }) => {
		const supabase = await requireSupabase(locals);
		if (!supabase) return fail(401, { promptMessage: '로그인해야 프롬프트를 저장할 수 있습니다.' });

		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const title = String(form.get('title') ?? '').trim().slice(0, TITLE_MAX_LENGTH);
		const content = normalizeCustomPrompt(form.get('content'));
		if (!content) return fail(400, { promptMessage: '저장할 프롬프트 내용을 입력하세요.' });

		if (id) {
			const { data, error } = await supabase
				.from('custom_prompts')
				.update({ content, ...(title && { title }) })
				.eq('id', id)
				.select('id');
			if (error) return fail(500, { promptMessage: `저장 실패: ${error.message}` });
			if (data.length === 0) return fail(404, { promptMessage: '프롬프트를 찾을 수 없습니다.' });
			return { promptMessage: '프롬프트를 덮어썼습니다.', savedPromptId: id };
		}

		if (!title) return fail(400, { promptMessage: '프롬프트 이름을 입력하세요.' });
		const { count } = await supabase.from('custom_prompts').select('id', { count: 'exact', head: true });
		if ((count ?? 0) >= MAX_CUSTOM_PROMPTS) {
			return fail(400, { promptMessage: `프롬프트는 최대 ${MAX_CUSTOM_PROMPTS}개까지 저장할 수 있습니다.` });
		}

		const { data, error } = await supabase.from('custom_prompts').insert({ title, content }).select('id').single();
		if (error) return fail(500, { promptMessage: `저장 실패: ${error.message}` });
		return { promptMessage: `'${title}' 프롬프트를 저장했습니다.`, savedPromptId: data.id };
	},

	deleteCustomPrompt: async ({ request, locals }) => {
		const supabase = await requireSupabase(locals);
		if (!supabase) return fail(401, { promptMessage: '로그인이 필요합니다.' });

		const id = String((await request.formData()).get('id') ?? '');
		const { error } = await supabase.from('custom_prompts').delete().eq('id', id);
		if (error) return fail(500, { promptMessage: `삭제 실패: ${error.message}` });
		return { promptMessage: '프롬프트를 삭제했습니다.', deletedPromptId: id };
	}
};
