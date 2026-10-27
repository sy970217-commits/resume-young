-- =====================================================================
-- guestbook-login.sql : 방명록을 "구글로 로그인한 사람만 남기기"로 바꾸기
--
-- 사용법
--   1) resume.sql 을 먼저 실행해 둔 상태여야 한다.
--   2) Supabase > SQL Editor 에 전체를 붙여 넣고 Run 한다. (몇 번 실행해도 오류 없음)
--   3) 구글 로그인 설정(Authentication > Sign In / Providers > Google)은 Supabase 화면에서 따로 한다.
--
-- 바뀌는 것 (resume_guestbook 표만)
--   - 글마다 "누가 썼는지"(user_id) 칸을 더한다. 이 SQL 전에 남긴 글은 주인이 없다(빈칸).
--   - 로그인하지 않은 방문자는 더 이상 글을 남길 수 없다(읽기는 그대로 누구나).
--   - 로그인한 사람은 "자기 이름표(user_id)를 단 글"만 남길 수 있고, 자기 글만 지울 수 있다.
--   - 관리자는 resume.sql 의 규칙대로 모든 글을 지울 수 있다(그대로 둔다).
--   - 고치기는 여전히 아무도 못 한다.
-- 다른 표(profile, projects, likes, admins)와 보관함은 건드리지 않는다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 글쓴이 칸 더하기
--    글을 남길 때 비워 두면 로그인한 사람의 id 가 자동으로 들어간다.
--    계정이 지워지면 글은 남고 글쓴이 칸만 빈칸이 된다.
-- ---------------------------------------------------------------------
alter table public.resume_guestbook
  add column if not exists user_id uuid
  references auth.users (id) on delete set null
  default auth.uid();


-- ---------------------------------------------------------------------
-- 2. 표 사용 권한 (큰 문)
--    방문자(anon): 읽기만.  로그인한 사람(authenticated): 읽기·남기기·지우기.
--    "누구 글을 지울 수 있나"는 아래 3번 규칙이 정한다.
-- ---------------------------------------------------------------------
revoke insert on public.resume_guestbook from anon;
grant select                 on public.resume_guestbook to anon, authenticated;
grant insert, delete         on public.resume_guestbook to authenticated;


-- ---------------------------------------------------------------------
-- 3. 규칙 (작은 문)
-- ---------------------------------------------------------------------

-- 예전 규칙(누구나 남기기)을 없앤다
drop policy if exists "resume_guestbook_insert" on public.resume_guestbook;

-- 로그인한 사람만, 글쓴이 칸이 "나"인 글만 남길 수 있다
drop policy if exists "resume_guestbook_insert_own" on public.resume_guestbook;
create policy "resume_guestbook_insert_own" on public.resume_guestbook
  for insert to authenticated
  with check (user_id = auth.uid());

-- 로그인한 사람은 자기 글만 지울 수 있다
-- (관리자의 "모든 글 지우기" 규칙 resume_guestbook_admin_delete 는 resume.sql 그대로 남아 있다)
drop policy if exists "resume_guestbook_delete_own" on public.resume_guestbook;
create policy "resume_guestbook_delete_own" on public.resume_guestbook
  for delete to authenticated
  using (user_id = auth.uid());

-- 읽기 규칙 resume_guestbook_read (누구나 읽기)는 resume.sql 그대로 둔다.
