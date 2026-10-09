/* global AudioWorkletProcessor, registerProcessor, sampleRate */
// 마이크 입력(브라우저 기본 샘플레이트)을 16kHz 16-bit PCM으로 변환해 20ms 단위로 전달한다.
const TARGET_RATE = 16000;
const CHUNK = 320; // 20ms @ 16kHz

class CaptureProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		this.ratio = sampleRate / TARGET_RATE;
		this.pos = 0;
		this.acc = 0;
		this.cnt = 0;
		this.out = new Int16Array(CHUNK);
		this.n = 0;
		this.sq = 0;
	}

	process(inputs) {
		const ch = inputs[0]?.[0];
		if (!ch) return true;

		for (let i = 0; i < ch.length; i++) {
			// 구간 평균(box filter)으로 다운샘플링 — 정수가 아닌 비율(44.1k 등)도 처리
			this.acc += ch[i];
			this.cnt++;
			this.pos++;
			if (this.pos < this.ratio) continue;
			this.pos -= this.ratio;

			const s = Math.max(-1, Math.min(1, this.acc / this.cnt));
			this.acc = 0;
			this.cnt = 0;
			this.out[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
			this.sq += s * s;

			if (this.n === CHUNK) {
				const pcm = this.out.buffer;
				this.port.postMessage({ pcm, rms: Math.sqrt(this.sq / CHUNK) }, [pcm]);
				this.out = new Int16Array(CHUNK);
				this.n = 0;
				this.sq = 0;
			}
		}
		return true;
	}
}

registerProcessor('capture-processor', CaptureProcessor);
