-- supabase/migrations/20261010000000_conversation_history.sql
-- 사용자별 영어회화 기록 저장용 테이블
--   profiles               : 앱 사용자 (auth.users 와 1:1)
--   conversations          : 회화 세션 1회 (대화 시작 ~ 종료)
--   conversation_messages  : 세션 안의 자막 한 줄 (LiveSession.messages 와 같은 구조)
-- 모든 테이블은 RLS 로 "본인 데이터만" 읽고 쓸 수 있다.

-- =========================================================
-- 1. 사용자 테이블
-- =========================================================
create table public.profiles (
	id uuid primary key references auth.users (id) on delete cascade,
	email text,
	display_name text,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

comment on table public.profiles is '앱 사용자 정보. auth.users 가입 시 트리거로 자동 생성된다';

-- 회원가입(auth.users insert) 시 profiles 행을 자동으로 만든다
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	insert into public.profiles (id, email)
	values (new.id, new.email);
	return new;
end;
$$;

create trigger on_auth_user_created
	after insert on auth.users
	for each row execute function public.handle_new_user();

-- 이 마이그레이션 이전에 가입한 사용자도 profiles 에 채워 넣는다
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- updated_at 자동 갱신
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
	new.updated_at = now();
	return new;
end;
$$;

create trigger profiles_set_updated_at
	before update on public.profiles
	for each row execute function public.set_updated_at();

-- =========================================================
-- 2. 회화 세션 테이블
-- =========================================================
create table public.conversations (
	id uuid primary key default gen_random_uuid(),
	-- insert 시 생략하면 로그인한 사용자로 채워진다
	user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
	title text,
	started_at timestamptz not null default now(),
	ended_at timestamptz,
	created_at timestamptz not null default now()
);

comment on table public.conversations is '영어회화 세션 1회. 목록 화면의 한 줄에 해당한다';

-- "내 기록 최신순" 조회용
create index conversations_user_started_idx on public.conversations (user_id, started_at desc);

-- =========================================================
-- 3. 회화 메시지(자막) 테이블
-- =========================================================
create table public.conversation_messages (
	id bigint generated always as identity primary key,
	conversation_id uuid not null references public.conversations (id) on delete cascade,
	-- 세션 안에서의 순서 (LiveSession.messages 의 인덱스)
	seq integer not null,
	role text not null check (role in ('user', 'ai')),
	content text not null,
	-- 사용자가 끼어들어 AI 발화가 중단된 경우
	interrupted boolean not null default false,
	created_at timestamptz not null default now(),
	unique (conversation_id, seq)
);

comment on table public.conversation_messages is '회화 세션의 자막. role 은 user(학습자) 또는 ai(튜터)';

-- =========================================================
-- 4. RLS: 본인 데이터만 접근
--    (select auth.uid()) 형태는 행마다 함수를 다시 부르지 않아 빠르다
-- =========================================================
alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;

-- profiles: 생성은 트리거가 하므로 조회·수정만 허용
create policy "본인 프로필 조회" on public.profiles
	for select to authenticated
	using (id = (select auth.uid()));

create policy "본인 프로필 수정" on public.profiles
	for update to authenticated
	using (id = (select auth.uid()))
	with check (id = (select auth.uid()));

-- conversations
create policy "본인 회화 조회" on public.conversations
	for select to authenticated
	using (user_id = (select auth.uid()));

create policy "본인 회화 생성" on public.conversations
	for insert to authenticated
	with check (user_id = (select auth.uid()));

create policy "본인 회화 수정" on public.conversations
	for update to authenticated
	using (user_id = (select auth.uid()))
	with check (user_id = (select auth.uid()));

create policy "본인 회화 삭제" on public.conversations
	for delete to authenticated
	using (user_id = (select auth.uid()));

-- conversation_messages: 부모 회화의 소유자인지로 판단
create policy "본인 회화 메시지 조회" on public.conversation_messages
	for select to authenticated
	using (
		exists (
			select 1 from public.conversations c
			where c.id = conversation_id and c.user_id = (select auth.uid())
		)
	);

create policy "본인 회화 메시지 생성" on public.conversation_messages
	for insert to authenticated
	with check (
		exists (
			select 1 from public.conversations c
			where c.id = conversation_id and c.user_id = (select auth.uid())
		)
	);

create policy "본인 회화 메시지 삭제" on public.conversation_messages
	for delete to authenticated
	using (
		exists (
			select 1 from public.conversations c
			where c.id = conversation_id and c.user_id = (select auth.uid())
		)
	);
