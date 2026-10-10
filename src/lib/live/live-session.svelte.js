import {
  buildSetupMessage,
  liveSocketUrl,
  INPUT_SAMPLE_RATE,
  OUTPUT_SAMPLE_RATE,
} from "./config.js";
import { HistoryRecorder } from "./history-recorder.svelte.js";

// static/worklets 의 파일은 번들링 없이 그대로 제공된다
const captureWorkletUrl = "/worklets/capture.js";
const playbackWorkletUrl = "/worklets/playback.js";

/** @typedef {{ id: number, role: 'user' | 'ai', text: string, done: boolean, interrupted?: boolean }} Message */
/** @typedef {{ id: number, time: string, level: 'info' | 'ok' | 'warn' | 'error', text: string }} LogEntry */
/** @typedef {{ code: number, reason: string, wasClean: boolean, byClient: boolean, ms: number | null }} CloseInfo */

/** 마이크 레벨이 이 값보다 크면 '말하는 중'으로 본다 (응답 지연 측정용) */
const VOICE_RMS = 0.02;
/** 종료 요청 후 서버 응답을 기다리는 시간 */
const CLOSE_TIMEOUT_MS = 5000;
const WS_STATES = /** @type {const} */ ([
  "CONNECTING",
  "OPEN",
  "CLOSING",
  "CLOSED",
]);

/** @param {ArrayBuffer} buf */
function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

/** @param {string} b64 */
function fromBase64(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

function clockTime() {
  const d = new Date();
  const pad = (/** @type {number} */ n, l = 2) => String(n).padStart(l, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

export class LiveSession {
  /**
   * @param {{ canSave?: () => boolean }} [options]
   *   canSave: 대화를 회화 기록으로 저장할지 (로그인 여부)
   */
  constructor({ canSave = () => false } = {}) {
    this.canSave = canSave;
  }

  status = $state(
    /** @type {'idle' | 'connecting' | 'live' | 'error'} */ ("idle"),
  );
  error = $state("");
  notice = $state("");
  muted = $state(false);
  micLevel = $state(0);
  aiSpeaking = $state(false);
  /** 사용자가 말을 멈춘 뒤 AI 첫 음성이 도착하기까지 (ms) */
  lastLatency = $state(/** @type {number | null} */ (null));
  messages = $state(/** @type {Message[]} */ ([]));
  /** 현재 대화의 회화 기록 저장 담당 (연결마다 새로 만든다) */
  history = $state(new HistoryRecorder());

  /** 실제 리소스 상태 (UI 표시값이 아니라 브라우저 객체에서 읽어 온 값) */
  link = $state({
    ws: /** @type {'none' | (typeof WS_STATES)[number]} */ ("none"),
    mic: /** @type {'off' | 'live' | 'ended'} */ ("off"),
    inCtx: /** @type {'none' | AudioContextState} */ ("none"),
    outCtx: /** @type {'none' | AudioContextState} */ ("none"),
    sent: 0,
    received: 0,
    lastSentAt: 0,
    lastRecvAt: 0,
    close: /** @type {CloseInfo | null} */ (null),
  });
  /** @type {LogEntry[]} */
  log = $state([]);

  /** 서버 연결·마이크·오디오 장치가 모두 해제되었는가 */
  released = $derived(
    (this.link.ws === "none" || this.link.ws === "CLOSED") &&
      this.link.mic !== "live" &&
      (this.link.inCtx === "none" || this.link.inCtx === "closed") &&
      (this.link.outCtx === "none" || this.link.outCtx === "closed"),
  );

  /** @type {WebSocket | null} */ ws = null;
  /** 종료 요청을 보냈고 서버 응답(close 프레임)을 기다리는 소켓 */
  /** @type {WebSocket | null} */ closingWs = null;
  /** @type {MediaStream | null} */ stream = null;
  /** @type {AudioContext | null} */ inCtx = null;
  /** @type {AudioContext | null} */ outCtx = null;
  /** @type {AudioWorkletNode | null} */ captureNode = null;
  /** @type {AudioWorkletNode | null} */ playbackNode = null;

  ready = false;
  lastVoiceAt = 0;
  awaitingReply = false;
  nextId = 1;
  nextLogId = 1;
  /** 연결 시도마다 증가. 진행 중이던 connect()가 취소되었는지 판별한다 */
  gen = 0;
  /** 이번 대화의 튜터 설정 @type {import('./tutor-prompt.js').TutorSettings | undefined} */
  settings;
  /** 토큰 발급 시 서버가 만들어 돌려준 시스템 프롬프트 (setup 메시지에 그대로 사용) */
  systemPrompt = "";
  /** 이번 대화에 사용한 저장 프롬프트 id @type {string | null} */
  customPromptId = null;
  closeRequestedAt = 0;
  /** @type {ReturnType<typeof setTimeout> | undefined} */ closeTimer;

  /** @param {LogEntry['level']} level @param {string} text */
  addLog(level, text) {
    this.log.push({ id: this.nextLogId++, time: clockTime(), level, text });
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200);
  }

  /**
   * @param {import('./tutor-prompt.js').TutorSettings} [settings] 이번 대화의 튜터 설정
   * @param {string | null} [customPromptId] 수정 없이 사용한 저장 프롬프트 id (회화 기록에 연결)
   */
  async connect(settings, customPromptId = null) {
    if (this.status === "connecting" || this.status === "live") return;
    const gen = ++this.gen;
    // 대화 도중 설정 화면이 바뀌어도 이번 세션에는 영향이 없도록 복사해 둔다
    this.settings = settings ? { ...settings } : undefined;
    this.customPromptId = customPromptId;
    this.status = "connecting";
    this.error = "";
    this.notice = "";
    this.messages = [];
    // 이전 대화의 기록기는 남은 저장을 마저 끝내도록 두고, 새 대화용으로 교체한다
    this.history = new HistoryRecorder();
    this.lastLatency = null;
    this.log = [];
    Object.assign(this.link, {
      sent: 0,
      received: 0,
      lastSentAt: 0,
      lastRecvAt: 0,
      close: null,
    });
    this.addLog("info", "연결 시작");

    // AudioContext는 사용자 클릭 직후(동기 구간)에 만들어야 자동재생 정책에 걸리지 않는다
    this.inCtx = this.trackContext(
      new AudioContext({ latencyHint: "interactive" }),
      "inCtx",
    );
    this.outCtx = this.trackContext(
      new AudioContext({
        sampleRate: OUTPUT_SAMPLE_RATE,
        latencyHint: "interactive",
      }),
      "outCtx",
    );

    const micPromise = navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    try {
      // 토큰 발급, 마이크 권한, 워클릿 로딩을 병렬로 처리해 연결 시간을 줄인다
      const [token, stream] = await Promise.all([
        this.fetchToken(),
        micPromise,
        this.inCtx.audioWorklet.addModule(captureWorkletUrl),
        this.outCtx.audioWorklet.addModule(playbackWorkletUrl),
      ]);
      if (gen !== this.gen) {
        // 기다리는 동안 사용자가 취소함 → 방금 켜진 마이크를 바로 끈다
        this.releaseStray(stream);
        return;
      }
      this.stream = stream;
      this.watchMic(stream);
      this.setupAudioGraph();
      this.openSocket(token);
    } catch (e) {
      // Promise.all은 하나만 실패해도 즉시 reject → 나중에 허용된 마이크가 켜진 채 남지 않게 정리
      micPromise.then((s) => this.releaseStray(s)).catch(() => {});
      if (gen !== this.gen) return;
      this.fail(this.describeError(e));
    }
  }

  /** 세션에 연결되지 못한 마이크 스트림을 끈다 @param {MediaStream} stream */
  releaseStray(stream) {
    if (stream === this.stream) return;
    stream.getTracks().forEach((t) => t.stop());
    this.addLog("ok", "연결 전에 중단되어 마이크를 해제했습니다");
  }

  /** @param {AudioContext} ctx @param {'inCtx' | 'outCtx'} key */
  trackContext(ctx, key) {
    this.link[key] = ctx.state;
    ctx.onstatechange = () => {
      // 새 세션의 컨텍스트가 생긴 뒤에는 이전 컨텍스트의 이벤트로 덮어쓰지 않는다
      if (this[key] === ctx || this[key] === null) this.link[key] = ctx.state;
    };
    return ctx;
  }

  /** @param {MediaStream} stream */
  watchMic(stream) {
    this.link.mic = "live";
    this.addLog("ok", "마이크 켜짐");
    for (const track of stream.getAudioTracks()) {
      // 장치가 뽑히는 등 브라우저가 트랙을 끝낸 경우
      track.onended = () => {
        if (this.stream !== stream) return;
        this.link.mic = "ended";
        this.addLog(
          "warn",
          "마이크 입력이 끊겼습니다 (장치 분리 또는 권한 해제)",
        );
      };
    }
  }

  async fetchToken() {
    const res = await fetch("/api/live-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings: this.settings }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message ?? `토큰 발급 실패 (${res.status})`);
    }
    const { token, systemPrompt } = await res.json();
    this.systemPrompt = systemPrompt;
    this.addLog("ok", "임시 토큰 발급됨");
    return /** @type {string} */ (token);
  }

  setupAudioGraph() {
    const inCtx = /** @type {AudioContext} */ (this.inCtx);
    const outCtx = /** @type {AudioContext} */ (this.outCtx);

    this.captureNode = new AudioWorkletNode(inCtx, "capture-processor");
    inCtx
      .createMediaStreamSource(/** @type {MediaStream} */ (this.stream))
      .connect(this.captureNode);
    this.captureNode.port.onmessage = (e) =>
      this.onMicChunk(e.data.pcm, e.data.rms);

    this.playbackNode = new AudioWorkletNode(outCtx, "playback-processor", {
      outputChannelCount: [1],
    });
    this.playbackNode.connect(outCtx.destination);
    this.playbackNode.port.onmessage = (e) =>
      (this.aiSpeaking = e.data.playing);

    inCtx.resume();
    outCtx.resume();
  }

  /** @param {WebSocket} ws */
  syncWsState(ws) {
    if (ws === this.ws || ws === this.closingWs)
      this.link.ws = WS_STATES[ws.readyState];
  }

  /** @param {string} token */
  openSocket(token) {
    const ws = new WebSocket(liveSocketUrl(token));
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    this.closingWs = null;
    this.syncWsState(ws);
    this.addLog("info", "WebSocket 연결 시도");

    ws.onopen = () => {
      this.syncWsState(ws);
      this.addLog("ok", "WebSocket 연결됨 → setup 전송");
      ws.send(JSON.stringify(buildSetupMessage(this.systemPrompt)));
    };
    ws.onmessage = (e) => {
      // 종료 요청 후 도착한 메시지는 무시 (끊긴 세션이 다시 live로 바뀌는 것 방지)
      if (this.ws !== ws) return;
      this.link.received++;
      this.link.lastRecvAt = Date.now();
      const text =
        typeof e.data === "string" ? e.data : new TextDecoder().decode(e.data);
      this.onServerMessage(JSON.parse(text));
    };
    ws.onerror = () => {
      if (this.ws === ws) this.addLog("error", "WebSocket 오류 발생");
    };
    ws.onclose = (e) => {
      const byClient = ws === this.closingWs;
      if (!byClient && ws !== this.ws) return; // 이전 세션의 소켓
      clearTimeout(this.closeTimer);
      this.syncWsState(ws);
      this.link.close = {
        code: e.code,
        reason: e.reason,
        wasClean: e.wasClean,
        byClient,
        ms: byClient
          ? Math.round(performance.now() - this.closeRequestedAt)
          : null,
      };

      if (byClient) {
        this.closingWs = null;
        if (e.wasClean) {
          this.addLog(
            "ok",
            `서버가 종료를 확인했습니다 (code ${e.code}, ${this.link.close.ms}ms)`,
          );
        } else {
          this.addLog(
            "ok",
            `연결이 닫혔습니다 (code ${e.code}, 서버 응답 없이 종료)`,
          );
        }
        return;
      }

      const wasLive = this.status === "live";
      const reason = e.reason
        ? ` (${e.code}: ${e.reason})`
        : ` (code ${e.code})`;
      this.addLog(
        e.code === 1000 ? "warn" : "error",
        `서버가 먼저 연결을 닫았습니다${reason}`,
      );
      if (e.code === 1000 && wasLive) {
        this.notice = "세션이 종료되었습니다.";
        this.teardown("idle", "server", `서버가 세션을 종료했습니다${reason}`);
      } else {
        this.fail(`연결이 끊겼습니다${reason}`);
      }
    };
  }

  /** @param {ArrayBuffer} pcm @param {number} rms */
  onMicChunk(pcm, rms) {
    const level = this.muted ? 0 : rms;
    this.micLevel = this.micLevel * 0.6 + Math.min(1, level * 6) * 0.4;
    if (!this.ready || this.muted || this.ws?.readyState !== WebSocket.OPEN)
      return;

    if (rms > VOICE_RMS) {
      this.lastVoiceAt = performance.now();
      this.awaitingReply = true;
    }
    this.ws.send(
      JSON.stringify({
        realtimeInput: {
          audio: {
            data: toBase64(pcm),
            mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
          },
        },
      }),
    );
    this.link.sent++;
    this.link.lastSentAt = Date.now();
  }

  /** @param {any} msg */
  onServerMessage(msg) {
    if (msg.setupComplete) {
      this.ready = true;
      this.status = "live";
      this.history.start(this.canSave(), this.settings, this.customPromptId);
      this.addLog("ok", "세션 준비 완료 (setupComplete) — 대화 가능");
      // 모델이 먼저 인사하도록 첫 턴을 연다
      this.ws?.send(JSON.stringify({ realtimeInput: { text: "Hi!" } }));
      return;
    }

    if (msg.goAway) {
      this.notice = `서버가 곧 세션을 종료합니다 (남은 시간: ${msg.goAway.timeLeft ?? "알 수 없음"}).`;
      this.history.system(this.notice);
      this.addLog(
        "warn",
        `goAway 수신 (남은 시간: ${msg.goAway.timeLeft ?? "?"})`,
      );
    }

    const sc = msg.serverContent;
    if (!sc) return;

    if (sc.interrupted) {
      // 사용자가 끼어들면 재생 대기 중인 AI 음성을 즉시 버린다
      this.playbackNode?.port.postMessage("clear");
      const last = this.lastOf("ai");
      if (last && !last.done) {
        last.done = true;
        last.interrupted = true;
      }
    }

    for (const part of sc.modelTurn?.parts ?? []) {
      if (part.inlineData?.data) {
        if (this.awaitingReply && this.lastVoiceAt) {
          this.lastLatency = Math.round(performance.now() - this.lastVoiceAt);
          this.awaitingReply = false;
        }
        const buf = fromBase64(part.inlineData.data);
        this.playbackNode?.port.postMessage(buf, [buf]);
      }
    }

    if (sc.inputTranscription?.text)
      this.appendText("user", sc.inputTranscription.text);
    if (sc.outputTranscription?.text)
      this.appendText("ai", sc.outputTranscription.text);

    if (sc.turnComplete) {
      for (const m of this.messages) m.done = true;
      this.awaitingReply = false;
      // 턴이 끝날 때마다 이어서 저장 → 브라우저가 갑자기 꺼져도 여기까지는 남는다
      this.history.flush(this.messages);
    }
  }

  /** @param {'user' | 'ai'} role @param {string} text */
  appendText(role, text) {
    const last = this.messages.at(-1);
    if (last && last.role === role && !last.done) {
      last.text += text;
      return;
    }
    // 상대 쪽의 진행 중이던 메시지는 마감
    if (last && !last.done) last.done = true;
    this.messages.push({
      id: this.nextId++,
      role,
      text: text.trimStart(),
      done: false,
    });
  }

  /** @param {'user' | 'ai'} role */
  lastOf(role) {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].role === role) return this.messages[i];
    }
    return undefined;
  }

  toggleMute() {
    this.muted = !this.muted;
    // 음소거 시 서버에 남은 오디오를 바로 처리하도록 알린다
    if (this.muted && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    }
    this.addLog(
      "info",
      this.muted ? "음소거 (오디오 전송 중지, 연결은 유지)" : "음소거 해제",
    );
  }

  /**
   * 대화 종료 또는 연결 중 취소
   * @param {'user' | 'leave'} [reason] leave = 페이지를 떠나면서 종료
   */
  disconnect(reason = "user") {
    if (this.status === "idle" && !this.ws) return;
    this.addLog(
      "info",
      this.status === "connecting" ? "연결 취소 요청" : "대화 종료 요청",
    );
    this.teardown(
      "idle",
      reason,
      reason === "leave"
        ? "페이지를 떠나 대화가 종료되었습니다"
        : "사용자가 대화를 종료했습니다",
    );
  }

  /** @param {string} message */
  fail(message) {
    this.error = message;
    this.teardown("error", "error", `오류로 대화가 끊겼습니다: ${message}`);
  }

  /**
   * @param {'idle' | 'error'} status
   * @param {import('./history-recorder.svelte.js').EndReason} reason 회화 기록에 남길 종료 사유
   * @param {string} note 회화 기록에 남길 종료 안내 (시스템 메시지)
   */
  teardown(status, reason, note) {
    this.gen++; // 진행 중인 connect()가 있다면 무효화
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState <= WebSocket.OPEN) {
      this.closingWs = ws;
      this.closeRequestedAt = performance.now();
      ws.close(1000, "client disconnect");
      this.syncWsState(ws);
      this.addLog("info", "서버에 종료(close 1000) 전송 — 응답 대기");
      clearTimeout(this.closeTimer);
      this.closeTimer = setTimeout(() => {
        if (ws.readyState !== WebSocket.CLOSED) {
          this.addLog(
            "warn",
            `${CLOSE_TIMEOUT_MS / 1000}초 동안 서버 응답이 없습니다. 브라우저가 곧 강제로 끊습니다.`,
          );
        }
      }, CLOSE_TIMEOUT_MS);
    }
    this.ready = false;
    this.captureNode?.disconnect();
    this.playbackNode?.disconnect();

    if (this.stream) {
      const tracks = this.stream.getTracks();
      tracks.forEach((t) => t.stop());
      this.link.mic = tracks.every((t) => t.readyState === "ended")
        ? "ended"
        : "live";
      this.addLog(
        this.link.mic === "ended" ? "ok" : "warn",
        `마이크 트랙 종료 (${tracks[0]?.readyState})`,
      );
    }

    const ctxs = [this.inCtx, this.outCtx].filter((c) => c !== null);
    this.captureNode = this.playbackNode = null;
    this.stream = null;
    this.inCtx = this.outCtx = null;
    if (ctxs.length) {
      Promise.all(ctxs.map((c) => c.close().catch(() => {}))).then(() =>
        this.addLog("ok", "오디오 장치(입력/출력) 해제됨"),
      );
    }

    this.aiSpeaking = false;
    this.micLevel = 0;
    this.muted = false;
    for (const m of this.messages) m.done = true;
    this.status = status;
    // 대화가 시작되지 않았던 경우(연결 중 취소 등)에는 아무것도 하지 않는다
    this.history.end(this.messages, reason, note);
  }

  /** @param {unknown} e */
  describeError(e) {
    if (e instanceof DOMException && e.name === "NotAllowedError") {
      return "마이크 권한이 거부되었습니다. 브라우저 설정에서 마이크를 허용해 주세요.";
    }
    if (e instanceof DOMException && e.name === "NotFoundError") {
      return "사용할 수 있는 마이크가 없습니다.";
    }
    return e instanceof Error ? e.message : String(e);
  }
}
