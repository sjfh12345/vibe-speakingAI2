// src/lib/live/tutor-prompt.js
// 튜터 시스템 프롬프트 = 고정 규칙 + 사용자가 고를 수 있는 설정
// 서버(토큰 발급·기록 저장)와 브라우저(설정 화면·미리보기)가 같은 함수로 프롬프트를 만든다

export const TUTOR_LEVELS = /** @type {const} */ ([
	{
		value: 'beginner',
		label: '초급',
		description: '아주 쉬운 단어, 짧은 문장, 천천히',
		learner: 'a beginner',
		style: 'Use very simple words and short sentences, and speak slowly and clearly.'
	},
	{
		value: 'intermediate',
		label: '중급',
		description: '쉬운 어휘, 보통 속도',
		learner: 'an intermediate learner',
		style: 'Use simple vocabulary and a moderate speaking pace.'
	},
	{
		value: 'advanced',
		label: '고급',
		description: '자연스러운 표현·관용구, 원어민 속도',
		learner: 'an advanced learner',
		style: 'Use natural, rich vocabulary and common idioms at a natural speaking pace.'
	}
]);

export const CORRECTION_STYLES = /** @type {const} */ ([
	{
		value: 'recast',
		label: '자연스럽게 고쳐 말하기',
		description: '대화 흐름을 끊지 않고 올바른 표현으로 바꿔 말해 줘요',
		prompt:
			'If the learner makes a grammar or word-choice mistake, briefly recast the correct form in your reply (e.g. "Oh, you went to the park yesterday? Nice!") without interrupting the flow or lecturing.'
	},
	{
		value: 'explicit',
		label: '짧게 짚어 주기',
		description: '틀린 부분을 한 문장으로 알려 준 뒤 대화를 이어가요',
		prompt:
			'If the learner makes a grammar or word-choice mistake, point it out in one short sentence (e.g. "Quick tip: we say \'I went\', not \'I go\'."), then continue the conversation.'
	},
	{
		value: 'none',
		label: '교정 안 함',
		description: '실수는 넘어가고 대화에만 집중해요',
		prompt: "Do not correct the learner's mistakes; focus on keeping the conversation flowing."
	}
]);

/** 주제 입력 추천 (값은 모델이 이해하기 쉽도록 영어) */
export const TOPIC_SUGGESTIONS = [
	{ label: '하루 일과', value: '' },
	{ label: '카페 주문', value: 'Ordering at a cafe' },
	{ label: '여행', value: 'Travel plans and experiences' },
	{ label: '영어 면접', value: 'A job interview' },
	{ label: '취미', value: 'Hobbies and free time' },
	{ label: '스몰토크', value: 'Small talk with a coworker' }
];

export const TOPIC_MAX_LENGTH = 100;
/** 커스텀 프롬프트 최대 길이 (DB custom_prompts.content 제약과 같게 유지) */
export const CUSTOM_PROMPT_MAX_LENGTH = 500;

/** @typedef {{ level: string, correction: string, koreanHelp: boolean, topic: string, customPrompt: string }} TutorSettings */

/** @type {TutorSettings} */
export const DEFAULT_TUTOR_SETTINGS = {
	level: 'intermediate',
	correction: 'recast',
	koreanHelp: true,
	topic: '',
	customPrompt: ''
};

/**
 * 커스텀 프롬프트 정리: 앞뒤 공백 제거, 빈 줄 정리, 길이 제한
 * @param {unknown} value
 */
export function normalizeCustomPrompt(value) {
	if (typeof value !== 'string') return '';
	return value
		.replace(/\r/g, '')
		.replace(/[ \t]+/g, ' ')
		.replace(/\n{2,}/g, '\n')
		.trim()
		.slice(0, CUSTOM_PROMPT_MAX_LENGTH);
}

/**
 * 클라이언트·저장소에서 온 값을 허용된 설정으로 정리한다. 모르는 값은 기본값으로 바꾼다.
 * @param {unknown} input
 * @returns {TutorSettings}
 */
export function normalizeTutorSettings(input) {
	const raw = /** @type {Record<string, unknown>} */ (input && typeof input === 'object' ? input : {});
	const pick = (/** @type {readonly { value: string }[]} */ options, /** @type {unknown} */ value, /** @type {string} */ fallback) =>
		options.some((o) => o.value === value) ? /** @type {string} */ (value) : fallback;

	return {
		level: pick(TUTOR_LEVELS, raw.level, DEFAULT_TUTOR_SETTINGS.level),
		correction: pick(CORRECTION_STYLES, raw.correction, DEFAULT_TUTOR_SETTINGS.correction),
		koreanHelp: typeof raw.koreanHelp === 'boolean' ? raw.koreanHelp : DEFAULT_TUTOR_SETTINGS.koreanHelp,
		// 줄바꿈·따옴표를 없애 프롬프트 구조를 깨지 못하게 하고 길이를 제한한다
		topic:
			typeof raw.topic === 'string'
				? raw.topic.replace(/[\r\n"`]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TOPIC_MAX_LENGTH)
				: '',
		customPrompt: normalizeCustomPrompt(raw.customPrompt)
	};
}

/** 두 설정이 같은 프롬프트를 만드는지 @param {unknown} a @param {unknown} b */
export function sameTutorSettings(a, b) {
	return JSON.stringify(normalizeTutorSettings(a)) === JSON.stringify(normalizeTutorSettings(b));
}

/**
 * 설정으로 시스템 프롬프트를 만든다. 첫 두 줄(영어로만·짧게 대답)은 실시간 음성 대화를 위해 항상 고정이다.
 * @param {unknown} input
 */
export function buildSystemPrompt(input) {
	const s = normalizeTutorSettings(input);
	const level = TUTOR_LEVELS.find((l) => l.value === s.level) ?? TUTOR_LEVELS[1];
	const correction = CORRECTION_STYLES.find((c) => c.value === s.correction) ?? CORRECTION_STYLES[0];

	return [
		`You are a friendly English conversation tutor talking with a Korean learner (${level.learner}).`,
		'- Speak only in natural, spoken English. Keep each reply short: 1-2 sentences, then hand the turn back with a question.',
		`- ${level.style}`,
		`- ${correction.prompt}`,
		s.koreanHelp
			? '- If the learner speaks Korean or seems stuck, gently help with a short English hint, then continue.'
			: '- If the learner speaks Korean, kindly encourage them to try again in English, and keep your reply in English.',
		s.topic
			? `- The conversation topic is: "${s.topic}". Start by greeting the learner and opening this topic with a simple question, and keep the conversation around it.`
			: '- Start by greeting the learner and asking a simple question about their day.',
		// 사용자가 직접 쓴 요청은 마지막에 붙이고, 위의 규칙(영어로만·짧게)이 우선하도록 명시한다
		...(s.customPrompt
			? [
					'- Additional requests from the learner (follow them as long as they do not conflict with the rules above):',
					...s.customPrompt.split('\n').map((line) => `  ${line}`)
				]
			: [])
	].join('\n');
}

/**
 * 저장된 튜터 설정을 화면에 보여 줄 항목으로 바꾼다 (회화 기록 화면용)
 * @param {unknown} input
 * @returns {{ key: string, label: string, value: string }[]}
 */
export function describeTutorSettings(input) {
	const s = normalizeTutorSettings(input);
	const suggestion = TOPIC_SUGGESTIONS.find((t) => t.value === s.topic);
	return [
		{ key: 'level', label: '영어 수준', value: TUTOR_LEVELS.find((l) => l.value === s.level)?.label ?? s.level },
		{ key: 'topic', label: '대화 주제', value: suggestion?.label ?? s.topic },
		{
			key: 'correction',
			label: '실수 교정',
			value: CORRECTION_STYLES.find((c) => c.value === s.correction)?.label ?? s.correction
		},
		{ key: 'koreanHelp', label: '한국어 도움', value: s.koreanHelp ? '켬' : '끔' }
	];
}
