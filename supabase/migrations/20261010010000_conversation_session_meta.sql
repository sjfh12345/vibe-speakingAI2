-- supabase/migrations/20261010010000_conversation_session_meta.sql
-- 회화 세션에 사용 정보(모델·튜터 설정·튜터 지시문·종료 사유)를 남기고, 시스템 메시지를 저장할 수 있게 한다
-- 일부만 적용된 상태에서 다시 실행해도 안전하도록 작성했다

-- =========================================================
-- 1. 사용 정보 컬럼 (이미 있으면 건너뜀)
-- =========================================================
alter table public.conversations
	add column if not exists model text,
	add column if not exists system_prompt text,
	add column if not exists end_reason text,
	add column if not exists tutor_settings jsonb;

-- 튜터 설정은 JSON 객체만 허용 (예: {"level":"intermediate","correction":"recast","koreanHelp":true,"topic":""})
alter table public.conversations drop constraint if exists conversations_tutor_settings_check;
alter table public.conversations
	add constraint conversations_tutor_settings_check
	check (tutor_settings is null or jsonb_typeof(tutor_settings) = 'object');

comment on column public.conversations.tutor_settings is
	'대화에 사용한 튜터(AI) 설정: level / correction / koreanHelp / topic. null 이면 설정 기능 도입 전 기록(기본 설정)';
comment on column public.conversations.system_prompt is 'tutor_settings 로 만들어 실제 AI 에 전달한 시스템 프롬프트 원문';

-- user: 사용자가 종료 / server: 서버가 세션 종료 / error: 연결 오류 / leave: 페이지를 떠남
alter table public.conversations drop constraint if exists conversations_end_reason_check;
alter table public.conversations
	add constraint conversations_end_reason_check
	check (end_reason in ('user', 'server', 'error', 'leave'));

comment on column public.conversations.ended_at is 'null 이면 진행 중이거나 비정상 종료(브라우저 강제 종료 등)';

-- =========================================================
-- 2. role 에 'system' 허용
--    제약 이름과 상관없이 role 컬럼의 기존 check 제약을 모두 지우고 다시 만든다
-- =========================================================
do $$
declare
	r record;
begin
	for r in
		select con.conname
		from pg_constraint con
		join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
		where con.conrelid = 'public.conversation_messages'::regclass
			and con.contype = 'c'
			and att.attname = 'role'
	loop
		execute format('alter table public.conversation_messages drop constraint %I', r.conname);
	end loop;
end $$;

alter table public.conversation_messages
	add constraint conversation_messages_role_check check (role in ('user', 'ai', 'system'));

comment on table public.conversation_messages is '회화 세션의 메시지. role: user(학습자) / ai(튜터) / system(세션 이벤트)';

-- =========================================================
-- 3. API(PostgREST)가 바뀐 테이블 구조를 바로 인식하도록 스키마 캐시 새로고침
-- =========================================================
notify pgrst, 'reload schema';
