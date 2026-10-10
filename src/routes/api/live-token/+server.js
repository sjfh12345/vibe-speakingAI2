import { json, error } from '@sveltejs/kit';
import { GEMINI_API_KEY } from '$app/env/private';
import { GoogleGenAI } from '@google/genai';
import { LIVE_MODEL, LIVE_API_VERSION, buildLiveConnectConfig } from '#lib/live/config.js';
import { buildSystemPrompt } from '#lib/live/tutor-prompt.js';

/**
 * 브라우저가 Live API에 직접 접속할 수 있도록 1회용 임시 토큰을 발급한다. API 키는 서버에만 둔다.
 * body: { settings? } — 사용자 튜터 설정. 서버에서 검증해 프롬프트를 만들고 토큰에 고정한다.
 */
export async function POST({ request }) {
	if (!GEMINI_API_KEY) {
		error(500, 'GEMINI_API_KEY가 설정되지 않았습니다. 프로젝트 루트의 .env 파일을 확인하세요.');
	}

	const body = await request.json().catch(() => null);
	const systemPrompt = buildSystemPrompt(body?.settings);

	const ai = new GoogleGenAI({
		apiKey: GEMINI_API_KEY,
		httpOptions: { apiVersion: LIVE_API_VERSION }
	});

	const now = Date.now();
	try {
		const token = await ai.authTokens.create({
			config: {
				uses: 1,
				expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
				newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
				// 모델과 튜터 설정을 토큰에 고정 → 브라우저에서 바꿀 수 없음
				liveConnectConstraints: { model: LIVE_MODEL, config: buildLiveConnectConfig(systemPrompt) }
			}
		});
		// setup 메시지에도 같은 프롬프트를 쓰도록 함께 돌려준다
		return json({ token: token.name, systemPrompt });
	} catch (e) {
		console.error('[live-token]', e);
		error(502, `토큰 발급 실패: ${e instanceof Error ? e.message : String(e)}`);
	}
}
