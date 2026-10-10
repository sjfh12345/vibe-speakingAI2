-- supabase/migrations/20261010020000_user_profile_consents.sql
-- 개인정보(이름·전화번호)와 약관 동의 기록
--   profiles          : full_name / phone / onboarded_at 컬럼 추가, 이메일 변경 동기화
--   policy_documents  : 이용약관·개인정보 처리방침 문서 (버전 관리)
--   user_consents     : 사용자가 어떤 버전의 문서에 언제 동의했는지 (변경·삭제 불가 기록)
-- 최초 로그인 시 /onboarding 에서 complete_onboarding() 으로 한 번에 저장한다.
-- Supabase SQL Editor 에 붙여 넣어 실행해도 되며, 다시 실행해도 안전하다
-- 선행 조건: 20261010000000_conversation_history.sql 이 적용되어 있어야 한다

-- =========================================================
-- 1. profiles: 이름·전화번호·온보딩 완료 시각
-- =========================================================
alter table public.profiles
	add column if not exists full_name text,
	add column if not exists phone text,
	add column if not exists onboarded_at timestamptz;

alter table public.profiles drop constraint if exists profiles_full_name_check;
alter table public.profiles
	add constraint profiles_full_name_check
	check (full_name is null or char_length(btrim(full_name)) between 1 and 30);

-- 숫자만 저장한다 (예: 01012345678). 하이픈은 화면에서만 붙인다
alter table public.profiles drop constraint if exists profiles_phone_check;
alter table public.profiles
	add constraint profiles_phone_check
	check (phone is null or phone ~ '^01[016789][0-9]{7,8}$');

comment on column public.profiles.full_name is '사용자 이름 (최초 로그인 시 입력)';
comment on column public.profiles.phone is '휴대전화 번호, 숫자만 (최초 로그인 시 입력)';
comment on column public.profiles.onboarded_at is '최초 로그인 시 이름·전화번호 입력과 필수 약관 동의를 마친 시각';

-- auth.users 의 이메일이 바뀌면 profiles.email 도 맞춘다 (기존에는 가입 시점 값만 복사됨)
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
	update public.profiles set email = new.email where id = new.id;
	return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
	after update of email on auth.users
	for each row
	when (old.email is distinct from new.email)
	execute function public.handle_user_email_change();

-- =========================================================
-- 2. 약관 문서
--    개정 시: 기존 행의 is_current 를 false 로 바꾸고 새 version 행을 is_current = true 로 넣는다
--    → 새 버전에 동의하지 않은 사용자는 다음 접속 때 다시 동의 화면으로 이동한다
-- =========================================================
create table if not exists public.policy_documents (
	id uuid primary key default gen_random_uuid(),
	-- terms: 서비스 이용약관 / privacy: 개인정보 수집·이용 동의
	type text not null check (type in ('terms', 'privacy')),
	version text not null,
	title text not null,
	content text not null,
	required boolean not null default true,
	is_current boolean not null default true,
	-- 동의 화면에 보여 줄 순서
	sort_order integer not null default 0,
	effective_at timestamptz not null default now(),
	created_at timestamptz not null default now(),
	unique (type, version)
);

comment on table public.policy_documents is '이용약관·개인정보 처리방침 문서. 종류(type)별로 is_current 인 버전이 하나만 있다';

-- 종류별 현재 버전은 하나만
create unique index if not exists policy_documents_current_idx
	on public.policy_documents (type) where is_current;

-- =========================================================
-- 3. 동의 기록
--    동의한 문서마다 한 행. 사용자가 고치거나 지울 수 없도록 update/delete 정책을 두지 않는다
-- =========================================================
create table if not exists public.user_consents (
	id bigint generated always as identity primary key,
	user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
	document_id uuid not null references public.policy_documents (id),
	agreed_at timestamptz not null default now(),
	-- 동의 증빙용 접속 정보
	ip_address inet,
	user_agent text,
	unique (user_id, document_id)
);

comment on table public.user_consents is '사용자별 약관 동의 기록 (어떤 버전에 언제 동의했는지)';

create index if not exists user_consents_document_idx on public.user_consents (document_id);

-- =========================================================
-- 4. RLS
-- =========================================================
alter table public.policy_documents enable row level security;
alter table public.user_consents enable row level security;

-- 약관은 로그인 전에도 읽을 수 있다. 작성·수정은 SQL Editor(관리자)에서만
drop policy if exists "약관 조회" on public.policy_documents;
create policy "약관 조회" on public.policy_documents
	for select to anon, authenticated
	using (true);

drop policy if exists "본인 동의 조회" on public.user_consents;
create policy "본인 동의 조회" on public.user_consents
	for select to authenticated
	using (user_id = (select auth.uid()));

drop policy if exists "본인 동의 생성" on public.user_consents;
create policy "본인 동의 생성" on public.user_consents
	for insert to authenticated
	with check (user_id = (select auth.uid()));

-- =========================================================
-- 5. 함수
-- =========================================================

-- 로그인한 사용자가 아직 동의하지 않은 "현재 버전의 필수 문서"
create or replace function public.pending_policy_documents()
returns setof public.policy_documents
language sql
stable
security invoker
set search_path = ''
as $$
	select d.*
	from public.policy_documents d
	where d.is_current
		and d.required
		and not exists (
			select 1 from public.user_consents c
			where c.document_id = d.id and c.user_id = (select auth.uid())
		)
	order by d.sort_order, d.type;
$$;

-- 이름·전화번호 저장과 약관 동의를 한 트랜잭션으로 처리한다
-- 호출자 권한(security invoker)으로 실행되므로 RLS 가 그대로 적용된다
create or replace function public.complete_onboarding(
	p_full_name text,
	p_phone text,
	p_document_ids uuid[],
	p_ip_address inet default null,
	p_user_agent text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
	v_uid uuid := auth.uid();
begin
	if v_uid is null then
		raise exception '로그인이 필요합니다.' using errcode = '42501';
	end if;

	if exists (
		select 1 from public.pending_policy_documents() d
		where not (d.id = any (coalesce(p_document_ids, '{}')))
	) then
		raise exception '필수 약관에 모두 동의해야 합니다.' using errcode = 'P0001';
	end if;

	-- 현재 버전 문서만 기록한다 (선택 약관이 생기면 함께 넘겨 동의 처리)
	insert into public.user_consents (user_id, document_id, ip_address, user_agent)
	select v_uid, d.id, p_ip_address, left(p_user_agent, 500)
	from public.policy_documents d
	where d.is_current and d.id = any (p_document_ids)
	on conflict (user_id, document_id) do nothing;

	update public.profiles
	set full_name = btrim(p_full_name),
		phone = p_phone,
		onboarded_at = coalesce(onboarded_at, now())
	where id = v_uid;

	if not found then
		raise exception '프로필을 찾을 수 없습니다.' using errcode = 'P0002';
	end if;
end;
$$;

revoke execute on function public.complete_onboarding(text, text, uuid[], inet, text) from public, anon;
grant execute on function public.complete_onboarding(text, text, uuid[], inet, text) to authenticated;

-- =========================================================
-- 6. 초기 약관 (v1)
--    ※ 서비스 운영자 정보·연락처 등은 실제 내용으로 바꾸고 법률 검토를 받은 뒤 사용할 것
-- =========================================================
insert into public.policy_documents (type, version, title, sort_order, content)
values
(
	'terms',
	'2026-10-10',
	'서비스 이용약관',
	1,
	$terms$제1조 (목적)
이 약관은 AI 영어회화 서비스(이하 "서비스")의 이용 조건 및 절차, 회사와 회원의 권리·의무 및 책임 사항을 정하는 것을 목적으로 합니다.

제2조 (회원가입 및 계정)
1. 회원은 이메일 인증을 거쳐 가입하며, 최초 로그인 시 이름과 휴대전화 번호를 입력해야 합니다.
2. 회원은 본인의 정확한 정보를 입력해야 하며, 계정과 비밀번호 관리 책임은 회원에게 있습니다.

제3조 (서비스의 내용)
1. 서비스는 AI 튜터와의 실시간 음성 영어회화, 회화 기록 저장 및 조회, 튜터 설정·프롬프트 저장 기능을 제공합니다.
2. AI 튜터의 응답은 자동 생성되며 정확성이나 완전성을 보장하지 않습니다.

제4조 (회원의 의무)
회원은 다음 행위를 해서는 안 됩니다.
- 타인의 정보 도용 또는 허위 정보 입력
- 서비스를 이용한 불법·유해 콘텐츠 생성 및 유포
- 서비스의 정상적인 운영을 방해하는 행위

제5조 (서비스의 변경 및 중단)
회사는 운영상·기술상 필요에 따라 서비스의 전부 또는 일부를 변경하거나 중단할 수 있으며, 중요한 변경은 사전에 공지합니다.

제6조 (회원 탈퇴)
회원은 언제든지 탈퇴를 요청할 수 있으며, 탈퇴 시 회원 정보와 회화 기록은 지체 없이 삭제됩니다.

제7조 (약관의 변경)
약관이 변경되는 경우 회사는 시행일 전에 공지하며, 회원은 변경된 약관에 다시 동의해야 서비스를 계속 이용할 수 있습니다.

부칙
이 약관은 2026년 10월 10일부터 시행합니다.$terms$
),
(
	'privacy',
	'2026-10-10',
	'개인정보 수집·이용 동의',
	2,
	$privacy$1. 수집하는 개인정보 항목
- 필수: 이메일, 비밀번호(암호화 저장), 이름, 휴대전화 번호
- 서비스 이용 과정에서 생성: 회화 기록(음성 대화의 자막 텍스트), 튜터 설정, 저장한 프롬프트, 접속 IP·브라우저 정보(약관 동의 시점)

2. 수집·이용 목적
- 회원 식별 및 가입·로그인 처리, 본인 확인
- AI 영어회화 서비스 제공 및 회화 기록 보관·조회
- 서비스 관련 공지 및 문의 응대
- 약관 동의 사실의 증빙

3. 보유 및 이용 기간
- 회원 탈퇴 시까지 보유하며, 탈퇴 시 지체 없이 파기합니다.
- 단, 관계 법령에서 보존을 요구하는 경우 해당 기간 동안 보관합니다.

4. 개인정보 처리 위탁 및 국외 이전
서비스 제공을 위해 다음 업체에 개인정보 처리를 위탁하며, 해당 업체의 서버는 국외에 있을 수 있습니다.
- Supabase Inc.: 회원 인증 및 데이터베이스 저장
- Google LLC (Gemini API): 실시간 음성 대화 처리 (대화 음성·텍스트)
- Vercel Inc.: 웹 서비스 호스팅

5. 동의를 거부할 권리
회원은 개인정보 수집·이용에 대한 동의를 거부할 권리가 있습니다. 다만 위 필수 항목은 서비스 제공에 반드시 필요하므로, 동의하지 않으면 서비스를 이용할 수 없습니다.$privacy$
)
on conflict (type, version) do nothing;

-- API(PostgREST)가 새 테이블·컬럼·함수를 바로 인식하도록 스키마 캐시 새로고침
notify pgrst, 'reload schema';
