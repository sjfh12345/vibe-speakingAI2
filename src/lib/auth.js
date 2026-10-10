// src/lib/auth.js

/** 비밀번호 최소 길이 (Supabase 기본값과 동일). 서버 검증과 화면 안내에서 함께 쓴다 */
export const MIN_PASSWORD_LENGTH = 6;

/** 회원 탈퇴 시 직접 입력해야 하는 확인 문구 */
export const DELETE_CONFIRM_TEXT = '회원 탈퇴';

/** 이름 최대 길이 (profiles_full_name_check 와 동일) */
export const NAME_MAX_LENGTH = 30;

/** 휴대전화 번호 형식, 숫자만 (profiles_phone_check 와 동일) */
export const PHONE_RE = /^01[016789]\d{7,8}$/;

/** 입력한 전화번호에서 숫자만 남긴다 @param {unknown} value */
export function normalizePhone(value) {
	return String(value ?? '').replace(/\D/g, '');
}

/** 숫자만 있는 전화번호에 하이픈을 붙인다 (01012345678 → 010-1234-5678) @param {string} digits */
export function formatPhone(digits) {
	if (digits.length === 10) return digits.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
	if (digits.length === 11) return digits.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3');
	return digits;
}
