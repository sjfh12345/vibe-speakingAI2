/* global AudioWorkletProcessor, registerProcessor */
// 24kHz 16-bit PCM 조각을 받는 즉시 이어서 재생하는 링 큐.
// 'clear' 메시지를 받으면 남은 오디오를 즉시 버린다 (끼어들기 시 사용).
class PlaybackProcessor extends AudioWorkletProcessor {
	constructor() {
		super();
		/** @type {Float32Array[]} */
		this.queue = [];
		this.cur = null;
		this.off = 0;
		this.playing = false;

		this.port.onmessage = (e) => {
			if (e.data === 'clear') {
				this.queue = [];
				this.cur = null;
				this.off = 0;
				return;
			}
			const i16 = new Int16Array(e.data);
			const f32 = new Float32Array(i16.length);
			for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 32768;
			this.queue.push(f32);
		};
	}

	process(_inputs, outputs) {
		const out = outputs[0][0];
		let i = 0;
		while (i < out.length) {
			if (!this.cur) {
				this.cur = this.queue.shift() ?? null;
				this.off = 0;
				if (!this.cur) break;
			}
			const n = Math.min(out.length - i, this.cur.length - this.off);
			out.set(this.cur.subarray(this.off, this.off + n), i);
			i += n;
			this.off += n;
			if (this.off >= this.cur.length) this.cur = null;
		}
		if (i < out.length) out.fill(0, i);

		const playing = i > 0;
		if (playing !== this.playing) {
			this.playing = playing;
			this.port.postMessage({ playing });
		}
		return true;
	}
}

registerProcessor('playback-processor', PlaybackProcessor);
