// src/app.d.ts
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { OnboardingStatus } from '#lib/server/onboarding.js';

declare global {
	namespace App {
		interface Locals {
			/** 요청별 Supabase 클라이언트 (환경변수가 없으면 undefined) */
			supabase?: SupabaseClient;
			/** 검증된 로그인 사용자. 로그아웃 상태면 null */
			getUser: () => Promise<User | null>;
			/** 이름·전화번호 입력과 필수 약관 동의 상태. 로그아웃 상태면 null */
			getOnboarding: () => Promise<OnboardingStatus | null>;
		}
	}
}

export {};
