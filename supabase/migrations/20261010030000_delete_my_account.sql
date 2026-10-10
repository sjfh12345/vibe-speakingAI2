-- supabase/migrations/20261010030000_delete_my_account.sql
-- 회원 탈퇴: 로그인한 사용자가 자기 계정을 삭제한다
-- auth.users 행을 지우면 FK(on delete cascade)로 아래 데이터가 함께 삭제된다
--   profiles → conversations → conversation_messages
--            → custom_prompts
--            → user_consents
-- Supabase SQL Editor 에 붙여 넣어 실행해도 되며, 다시 실행해도 안전하다

-- auth.users 는 일반 사용자 권한으로 지울 수 없으므로 security definer 로 실행한다
-- 대상은 항상 auth.uid() 본인뿐이라 다른 사용자를 지울 수 없다
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
	v_uid uuid := auth.uid();
begin
	if v_uid is null then
		raise exception '로그인이 필요합니다.' using errcode = '42501';
	end if;

	delete from auth.users where id = v_uid;
end;
$$;

comment on function public.delete_my_account() is '회원 탈퇴. 본인 계정과 모든 개인정보·회화 기록을 삭제한다';

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

notify pgrst, 'reload schema';
