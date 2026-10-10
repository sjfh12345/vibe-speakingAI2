// src/lib/live/history-recorder.svelte.js

/** @typedef {import('./live-session.svelte.js').Message} Message */
/** @typedef {'user' | 'server' | 'error' | 'leave'} EndReason */
/** @typedef {{ seq: number, role: 'user' | 'ai' | 'system', text: string, interrupted: boolean }} HistoryItem */

/** 브라우저가 keepalive 요청에 허용하는 본문 크기(64KB)보다 조금 작게 잡는다 */
const KEEPALIVE_LIMIT = 60000;

/**
 * 음성 대화 1회를 서버의 회화 세션 1개로 기록한다. LiveSession 연결마다 새로 만든다.
 * - 대화 시작: 세션 생성
 * - 턴 종료: 끝난 자막과 시스템 메시지를 이어서 저장
 * - 대화 종료: 남은 메시지 + 종료 시각·사유를 한 번에 저장 (페이지를 떠날 때도 전송되도록)
 * 요청은 순서대로 하나씩 보낸다.
 */
export class HistoryRecorder {
	/** skipped = 로그인하지 않아 기록 안 함 */
	state = $state(/** @type {'idle' | 'recording' | 'saving' | 'saved' | 'skipped' | 'error'} */ ('idle'));
	error = $state('');
	/** 서버의 회화 id (기록 보기 링크용) */
	id = $state(/** @type {string | null} */ (null));

	/** 기록 중인가 (start 이후, end 이전) */
	active = false;
	/** 이전 요청이 끝난 뒤 다음 요청을 보내기 위한 체인 */
	/** @type {Promise<unknown>} */ chain = Promise.resolve();
	/** 체인에서 아직 끝나지 않은 요청 수 */
	inflight = 0;
	/** 중간 저장이 한 번이라도 실패했는가 */
	failed = false;
	/** 다음에 확인할 LiveSession.messages 인덱스 */
	cursor = 0;
	/** 세션 안에서의 메시지 순서 */
	seq = 0;
	/** 학습자·튜터 발화가 있었는가 (없으면 빈 세션으로 보고 지운다) */
	hasChat = false;
	firstUserText = '';
	/** 아직 서버에 보내지 않은 메시지 @type {HistoryItem[]} */
	pending = [];

	/**
	 * 음성 대화가 시작될 때 호출
	 * @param {boolean} enabled 로그인 여부
	 * @param {import('./tutor-prompt.js').TutorSettings} [settings] 이번 대화의 튜터 설정 (서버가 프롬프트를 다시 만들어 저장)
	 * @param {string | null} [customPromptId] 수정 없이 사용한 저장 프롬프트 id
	 */
	start(enabled, settings, customPromptId = null) {
		if (!enabled) {
			this.state = 'skipped';
			return;
		}
		this.active = true;
		this.state = 'recording';
		const startedAt = Date.now();
		this.enqueue(async () => {
			const res = await this.request('/api/conversations', 'POST', { startedAt, settings, customPromptId });
			this.id = res.id;
		});
	}

	/** 세션 이벤트(서버 종료 예고, 오류 등)를 대화 흐름에 남긴다 @param {string} text */
	system(text) {
		if (!this.active) return;
		this.pending.push({ seq: this.seq++, role: 'system', text, interrupted: false });
	}

	/** 턴이 끝났을 때 완료된 자막을 저장한다 @param {Message[]} messages */
	flush(messages) {
		if (!this.active) return;
		this.collect(messages, false);
		if (this.pending.length === 0) return;
		const items = this.pending.splice(0);
		this.enqueue(() => this.id && this.request(`/api/conversations/${this.id}/messages`, 'POST', { messages: items }));
	}

	/**
	 * 대화가 끝났을 때 호출. 남은 메시지와 종료 정보를 저장한다.
	 * @param {Message[]} messages
	 * @param {EndReason} reason
	 * @param {string} note 종료 사유를 설명하는 시스템 메시지
	 */
	end(messages, reason, note) {
		if (!this.active) return;
		this.collect(messages, true);
		this.system(note);
		this.active = false;
		this.state = 'saving';

		const items = this.pending.splice(0);
		const endedAt = Date.now();
		const hasChat = this.hasChat;
		const title = this.firstUserText;
		const finish = async () => {
			if (!this.id) {
				// 세션 생성부터 실패한 경우 (error 에 원인이 남아 있다)
				this.state = 'error';
				return;
			}
			if (!hasChat) {
				// 인사도 오가기 전에 끝난 세션은 기록으로 남기지 않는다
				await this.request(`/api/conversations/${this.id}`, 'DELETE');
				this.id = null;
				this.state = 'idle';
				return;
			}
			await this.request(`/api/conversations/${this.id}`, 'PATCH', {
				endedAt,
				endReason: reason,
				title,
				messages: items
			});
			this.state = this.failed ? 'error' : 'saved';
		};

		if (this.inflight === 0 && this.id) {
			// 대기 중인 요청이 없으면 바로 보낸다. 페이지를 떠나는 중(pagehide)이면 다음 틱이 없을 수 있다
			this.track(finish());
		} else {
			this.enqueue(finish);
		}
	}

	/** messages 에서 아직 기록하지 않은 완료 메시지를 pending 에 옮긴다 @param {Message[]} messages @param {boolean} all */
	collect(messages, all) {
		while (this.cursor < messages.length && (all || messages[this.cursor].done)) {
			const m = messages[this.cursor++];
			const text = m.text.trim();
			if (!text) continue;
			this.pending.push({ seq: this.seq++, role: m.role, text, interrupted: Boolean(m.interrupted) });
			this.hasChat = true;
			if (m.role === 'user' && !this.firstUserText) this.firstUserText = text;
		}
	}

	/** @param {() => unknown} task */
	enqueue(task) {
		this.track(this.chain.then(task));
	}

	/** @param {Promise<unknown>} promise */
	track(promise) {
		this.inflight++;
		this.chain = promise
			.catch((e) => {
				this.failed = true;
				this.error = e instanceof Error ? e.message : String(e);
				this.state = 'error';
			})
			.finally(() => this.inflight--);
	}

	/**
	 * @param {string} url
	 * @param {'POST' | 'PATCH' | 'DELETE'} method
	 * @param {unknown} [data]
	 */
	async request(url, method, data) {
		const body = data === undefined ? undefined : JSON.stringify(data);
		const res = await fetch(url, {
			method,
			headers: body ? { 'content-type': 'application/json' } : undefined,
			body,
			// 페이지를 떠나는 중에도 요청이 끝까지 전송되도록 한다
			keepalive: (body?.length ?? 0) < KEEPALIVE_LIMIT
		});
		if (!res.ok) {
			const err = await res.json().catch(() => null);
			throw new Error(err?.message ?? `저장 실패 (${res.status})`);
		}
		return res.status === 204 ? null : res.json();
	}
}
