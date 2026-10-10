import { describe, it, expect } from 'vitest';
import { toUsageRow } from './usage.js';

const meta = { userId: 'u1', conversationId: null, model: 'gemini-3.8-live' };

describe('toUsageRow', () => {
	it('usageMetadata 를 모달리티별 토큰 컬럼으로 나눈다', () => {
		const usage = {
			promptTokenCount: 541,
			responseTokenCount: 200,
			totalTokenCount: 741,
			promptTokensDetails: [
				{ modality: 'TEXT', tokenCount: 300 },
				{ modality: 'AUDIO', tokenCount: 241 }
			],
			responseTokensDetails: [{ modality: 'AUDIO', tokenCount: 200 }]
		};
		const row = toUsageRow(usage, meta);
		expect(row).toMatchObject({
			user_id: 'u1',
			model: 'gemini-3.8-live',
			prompt_tokens: 541,
			response_tokens: 200,
			thoughts_tokens: 0,
			total_tokens: 741,
			input_text_tokens: 300,
			input_audio_tokens: 241,
			input_video_tokens: 0,
			output_text_tokens: 0,
			output_audio_tokens: 200,
			raw: usage
		});
	});

	it('uuid 가 아닌 회화 id 는 비운다', () => {
		expect(toUsageRow({}, { ...meta, conversationId: 'x' }).conversation_id).toBeNull();
		const id = '3f2b8c1e-1d2a-4c5b-9e8f-0a1b2c3d4e5f';
		expect(toUsageRow({}, { ...meta, conversationId: id }).conversation_id).toBe(id);
	});

	it('음수나 소수 토큰 수는 거부한다', () => {
		expect(() => toUsageRow({ promptTokenCount: -1 }, meta)).toThrow();
		expect(() => toUsageRow({ totalTokenCount: 1.5 }, meta)).toThrow();
	});
});
