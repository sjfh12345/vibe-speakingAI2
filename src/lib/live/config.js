// Gemini Live API 공통 설정 (서버 토큰 발급과 브라우저 세션이 함께 사용)

/** 저지연 음성 에이전트용 기본 모델 (thinking 미지원 → 추가 지연 없음) */
export const LIVE_MODEL = 'gemini-3.8-live';

/** 문서 기준 ephemeral token은 v1beta에서 동작. 연결이 안 되면 'v1alpha'로 바꿔볼 것 */
export const LIVE_API_VERSION = 'v1beta';

export const INPUT_SAMPLE_RATE = 16000;
export const OUTPUT_SAMPLE_RATE = 24000;

export const SYSTEM_PROMPT = `You are a friendly English conversation tutor talking with a Korean learner (intermediate level).
- Speak only in natural, spoken English. Keep each reply short: 1-2 sentences, then hand the turn back with a question.
- Use simple vocabulary and a moderate speaking pace.
- If the learner makes a grammar or word-choice mistake, briefly recast the correct form in your reply (e.g. "Oh, you went to the park yesterday? Nice!") without interrupting the flow or lecturing.
- If the learner speaks Korean or seems stuck, gently help with a short English hint, then continue.
- Start by greeting the learner and asking a simple question about their day.`;

const REALTIME_INPUT_CONFIG = {
	automaticActivityDetection: {
		// 말 시작을 빨리 감지 → 끼어들기(barge-in) 반응 속도 향상
		startOfSpeechSensitivity: 'START_SENSITIVITY_HIGH',
		// 말 끝을 빨리 확정 → 응답 시작 지연 단축
		endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH',
		prefixPaddingMs: 20,
		// 문서 권장 범위(500~800ms)의 최솟값. 더 줄이면 말 중간 쉼에서 끊김
		silenceDurationMs: 500
	},
	activityHandling: 'START_OF_ACTIVITY_INTERRUPTS'
};

/**
 * 토큰 발급 시 서버에서 고정하는 세션 설정 (@google/genai LiveConnectConfig 포맷).
 * 토큰에 잠긴 설정이 우선 적용되므로 튜터 설정의 실제 기준은 이것이다.
 */
export const LIVE_CONNECT_CONFIG = {
	responseModalities: ['AUDIO'],
	systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
	realtimeInputConfig: REALTIME_INPUT_CONFIG,
	inputAudioTranscription: {},
	outputAudioTranscription: {}
};

/** WebSocket setup 메시지 (wire 포맷). 토큰에 잠긴 설정과 같은 내용을 보낸다 */
export function buildSetupMessage() {
	return {
		setup: {
			model: `models/${LIVE_MODEL}`,
			generationConfig: { responseModalities: ['AUDIO'] },
			systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
			realtimeInputConfig: REALTIME_INPUT_CONFIG,
			inputAudioTranscription: {},
			outputAudioTranscription: {}
		}
	};
}

/** @param {string} token */
export function liveSocketUrl(token) {
	return (
		`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${LIVE_API_VERSION}` +
		`.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(token)}`
	);
}
