-- supabase/sql/add_tutor_settings.sql
-- 회화마다 어떤 AI 튜터 설정으로 대화했는지 저장하는 컬럼 추가
-- Supabase SQL Editor 에 붙여 넣어 실행한다. 다시 실행해도 안전하다
-- (같은 내용이 migrations/20261010010000_conversation_session_meta.sql 에도 포함되어 있다)

alter table public.conversations
	add column if not exists tutor_settings jsonb;

-- 튜터 설정은 JSON 객체만 허용 (예: {"level":"intermediate","correction":"recast","koreanHelp":true,"topic":""})
alter table public.conversations drop constraint if exists conversations_tutor_settings_check;
alter table public.conversations
	add constraint conversations_tutor_settings_check
	check (tutor_settings is null or jsonb_typeof(tutor_settings) = 'object');

comment on column public.conversations.tutor_settings is
	'대화에 사용한 튜터(AI) 설정: level / correction / koreanHelp / topic. null 이면 설정 기능 도입 전 기록(기본 설정)';

-- API(PostgREST)가 새 컬럼을 바로 인식하도록 스키마 캐시 새로고침
notify pgrst, 'reload schema';
