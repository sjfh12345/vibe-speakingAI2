// src/lib/server/auth-errors.js

/** @type {Record<string, string>} */
const MESSAGES = {
	invalid_credentials: '이메일 또는 비밀번호가 올바르지 않습니다.',
	email_not_confirmed: '이메일 인증이 완료되지 않았습니다. 받은 메일의 링크를 눌러주세요.',
	user_already_exists: '이미 가입된 이메일입니다.',
	email_exists: '이미 가입된 이메일입니다.',
	weak_password: '비밀번호가 너무 약합니다. 더 길고 복잡하게 설정하세요.',
	over_email_send_rate_limit: '메일 발송 한도를 초과했습니다. 잠시 후 다시 시도하세요.',
	over_request_rate_limit: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.',
	signup_disabled: '현재 회원가입이 비활성화되어 있습니다.'
};

/**
 * Supabase Auth 에러를 사용자에게 보여줄 한국어 메시지로 바꾼다
 * @param {{ code?: string, message: string }} error
 */
export function authErrorMessage(error) {
	return (error.code && MESSAGES[error.code]) || error.message;
}
