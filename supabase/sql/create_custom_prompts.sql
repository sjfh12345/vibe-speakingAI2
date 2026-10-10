-- supabase/sql/create_custom_prompts.sql
-- 사용자별 커스텀 프롬프트를 저장해 두고 골라 쓸 수 있게 하고, 회화 기록에 어떤 프롬프트를 썼는지 연결한다
-- Supabase SQL Editor 에 붙여 넣어 실행한다. 다시 실행해도 안전하다
-- 선행 조건: 001(profiles·conversations·set_updated_at) 이 적용되어 있어야 한다

-- =========================================================
-- 1. 사용자별 커스텀 프롬프트 테이블
--    content 는 튜터 시스템 프롬프트 끝에 '학습자 추가 요청'으로 붙는다 (src/lib/live/tutor-prompt.js)
-- =========================================================
create table if not exists public.custom_prompts (
	id uuid primary key default gen_random_uuid(),
	-- insert 시 생략하면 로그인한 사용자로 채워진다
	user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
	title text not null check (char_length(btrim(title)) between 1 and 30),
	content text not null check (char_length(btrim(content)) between 1 and 500),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

comment on table public.custom_prompts is '사용자가 저장해 둔 커스텀 튜터 프롬프트';

-- "내 프롬프트 최근 수정순" 조회용
create index if not exists custom_prompts_user_updated_idx on public.custom_prompts (user_id, updated_at desc);

drop trigger if exists custom_prompts_set_updated_at on public.custom_prompts;
create trigger custom_prompts_set_updated_at
	before update on public.custom_prompts
	for each row execute function public.set_updated_at();

-- =========================================================
-- 2. RLS: 본인 프롬프트만 접근
-- =========================================================
alter table public.custom_prompts enable row level security;

drop policy if exists "본인 프롬프트 조회" on public.custom_prompts;
create policy "본인 프롬프트 조회" on public.custom_prompts
	for select to authenticated
	using (user_id = (select auth.uid()));

drop policy if exists "본인 프롬프트 생성" on public.custom_prompts;
create policy "본인 프롬프트 생성" on public.custom_prompts
	for insert to authenticated
	with check (user_id = (select auth.uid()));

drop policy if exists "본인 프롬프트 수정" on public.custom_prompts;
create policy "본인 프롬프트 수정" on public.custom_prompts
	for update to authenticated
	using (user_id = (select auth.uid()))
	with check (user_id = (select auth.uid()));

drop policy if exists "본인 프롬프트 삭제" on public.custom_prompts;
create policy "본인 프롬프트 삭제" on public.custom_prompts
	for delete to authenticated
	using (user_id = (select auth.uid()));

-- =========================================================
-- 3. 회화 기록 ↔ 사용한 커스텀 프롬프트 연결
--    프롬프트를 지워도 기록은 남기고 연결만 끊는다
--    (대화 당시 내용은 tutor_settings.customPrompt 와 system_prompt 에 그대로 남아 있음)
-- =========================================================
alter table public.conversations
	add column if not exists custom_prompt_id uuid references public.custom_prompts (id) on delete set null;

create index if not exists conversations_custom_prompt_idx on public.conversations (custom_prompt_id);

comment on column public.conversations.custom_prompt_id is
	'대화에 사용한 저장 프롬프트. null 이면 커스텀 프롬프트 없이, 또는 저장하지 않은 내용으로 대화했거나 프롬프트가 삭제됨';

-- API(PostgREST)가 새 테이블·컬럼을 바로 인식하도록 스키마 캐시 새로고침
notify pgrst, 'reload schema';
