import { defineEnvVars } from '@sveltejs/kit/env';

// SvelteKit 3에서는 사용할 환경변수를 여기에 선언해야 $app/env/* 로 가져올 수 있다
export const variables = defineEnvVars({
	GEMINI_API_KEY: {
		description: 'Gemini API 키 (서버 전용). https://aistudio.google.com/apikey',
		// 값이 없어도 서버는 뜨게 하고, 토큰 발급 시 안내 메시지를 보여준다
		schema: (value) => value || undefined
	},
	SUPABASE_DB_URL: {
		description: 'Supabase 프로젝트 URL (https://<ref>.supabase.co)',
		schema: (value) => value || undefined
	},
	SUPABASE_DB_PUBLIC_KEY: {
		description: 'Supabase anon(public) 키. 권한은 RLS 정책으로 제한된다',
		schema: (value) => value || undefined
	}
});
