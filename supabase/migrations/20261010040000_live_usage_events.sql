-- supabase/migrations/20261010040000_live_usage_events.sql
-- Live API 사용량(usageMetadata) 저장용 테이블. 행 1개 = 서버 메시지 1건의 usageMetadata
--   /api/usage 가 로그인 사용자의 세션으로 insert 한다 (src/lib/server/usage.js 의 toUsageRow 와 컬럼이 같다)
-- 이미 DB 에 만들어 둔 스키마를 그대로 옮긴 것이라, 다시 실행해도 오류가 나지 않게 작성했다.

-- =========================================================
-- 1. 관리자 판별 (profiles.role = 'admin')
-- =========================================================
-- 이미 있으면 아무 일도 하지 않는다. 관리자 지정은 SQL 로 role 을 'admin' 으로 바꾼다
alter table public.profiles
	add column if not exists role text not null default 'user'
		constraint profiles_role_check check (role in ('user', 'admin'));

-- RLS 정책 안에서 profiles 를 다시 조회해도 profiles 의 RLS 에 막히지 않도록 security definer 로 둔다
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
	select exists (
		select 1 from public.profiles
		where id = (select auth.uid()) and role = 'admin'
	);
$$;

-- =========================================================
-- 2. 사용량 테이블
-- =========================================================
create table if not exists public.live_usage_events (
	id bigint generated always as identity primary key,
	-- 탈퇴(프로필 삭제) 후에도 비용 집계를 위해 사용량은 남긴다
	user_id uuid default auth.uid() references public.profiles (id) on delete set null,
	-- 인사 전에 끝나 지워진 회화도 사용량은 남긴다
	conversation_id uuid references public.conversations (id) on delete set null,
	model text not null,
	prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
	response_tokens integer not null default 0 check (response_tokens >= 0),
	thoughts_tokens integer not null default 0 check (thoughts_tokens >= 0),
	total_tokens integer not null default 0 check (total_tokens >= 0),
	input_text_tokens integer not null default 0 check (input_text_tokens >= 0),
	input_audio_tokens integer not null default 0 check (input_audio_tokens >= 0),
	input_video_tokens integer not null default 0 check (input_video_tokens >= 0),
	output_text_tokens integer not null default 0 check (output_text_tokens >= 0),
	output_audio_tokens integer not null default 0 check (output_audio_tokens >= 0),
	raw jsonb,
	created_at timestamptz not null default now()
);

comment on table public.live_usage_events is 'Live API 사용량(usageMetadata) 기록. 관리자 사용량·비용 집계에 쓴다';

-- 기간별 집계, 사용자별 조회, 회화별 조회용
create index if not exists live_usage_events_created_idx on public.live_usage_events (created_at);
create index if not exists live_usage_events_user_created_idx on public.live_usage_events (user_id, created_at);
create index if not exists live_usage_events_conversation_idx on public.live_usage_events (conversation_id);

-- =========================================================
-- 3. RLS
-- =========================================================
alter table public.live_usage_events enable row level security;

drop policy if exists "본인 사용량 기록" on public.live_usage_events;
create policy "본인 사용량 기록" on public.live_usage_events
	for insert to authenticated
	with check (
		user_id = (select auth.uid())
		and (
			conversation_id is null
			or exists (
				select 1 from public.conversations c
				where c.id = live_usage_events.conversation_id
					and c.user_id = (select auth.uid())
			)
		)
	);

drop policy if exists "본인 사용량 조회" on public.live_usage_events;
create policy "본인 사용량 조회" on public.live_usage_events
	for select to authenticated
	using (user_id = (select auth.uid()) or (select public.is_admin()));
