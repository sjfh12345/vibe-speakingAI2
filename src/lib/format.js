// src/lib/format.js

// 서버(Vercel, UTC)와 브라우저에서 같은 결과가 나오도록 시간대를 한국으로 고정한다
const TIME_ZONE = 'Asia/Seoul';

const dateFormat = new Intl.DateTimeFormat('ko-KR', {
	timeZone: TIME_ZONE,
	year: 'numeric',
	month: 'long',
	day: 'numeric',
	weekday: 'short'
});
const timeFormat = new Intl.DateTimeFormat('ko-KR', {
	timeZone: TIME_ZONE,
	hour: '2-digit',
	minute: '2-digit',
	hour12: false
});

/** 예: 2026년 10월 10일 (토) @param {string | Date} value */
export function formatDate(value) {
	return dateFormat.format(new Date(value));
}

/** 예: 14:05 @param {string | Date} value */
export function formatTime(value) {
	return timeFormat.format(new Date(value));
}

/** conversations.end_reason 표시용 */
export const END_REASON_LABELS = /** @type {Record<string, string>} */ ({
	user: '직접 종료',
	server: '서버 종료',
	error: '오류로 끊김',
	leave: '페이지 이탈'
});

/** 초 단위 길이. 예: 1시간 5분, 3분 20초 @param {number} totalSec */
export function formatSeconds(totalSec) {
	const sec = Math.max(0, Math.round(totalSec));
	const h = Math.floor(sec / 3600);
	const m = Math.floor((sec % 3600) / 60);
	const s = sec % 60;
	if (h > 0) return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
	if (m === 0) return `${s}초`;
	return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}

/**
 * 두 시각 사이의 길이. 예: 3분 20초
 * @param {string | Date} start
 * @param {string | Date | null} end
 */
export function formatDuration(start, end) {
	if (!end) return '';
	return formatSeconds((new Date(end).getTime() - new Date(start).getTime()) / 1000);
}
