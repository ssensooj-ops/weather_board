-- Supabase SQL Editor에서 실행하세요. 교육용 가상 데이터만 사용합니다.
-- 로그인 없는 앱이므로 공개 사용자는 모든 일정을 조회하고 추가할 수 있습니다.
begin;

create table if not exists public.wx_tasks (
  id bigint generated always as identity primary key,
  title text not null check (length(btrim(title)) > 0),
  region text not null check (region in ('세종', '대전', '태안', '보령')),
  kind text not null check (kind in ('야외', '고소', '실내')),
  owner text not null check (length(btrim(owner)) > 0),
  created_at timestamptz not null default now()
);

alter table public.wx_tasks enable row level security;

-- 테이블 권한과 RLS 정책을 모두 설정합니다. 수정·삭제는 허용하지 않습니다.
revoke all on table public.wx_tasks from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on table public.wx_tasks to anon, authenticated;
grant insert (title, region, kind, owner) on public.wx_tasks to anon, authenticated;
revoke all on sequence public.wx_tasks_id_seq from public, anon, authenticated;
grant usage on sequence public.wx_tasks_id_seq to anon, authenticated;

drop policy if exists wx_tasks_public_read on public.wx_tasks;
create policy wx_tasks_public_read on public.wx_tasks
  for select to anon, authenticated using (true);

drop policy if exists wx_tasks_public_insert on public.wx_tasks;
create policy wx_tasks_public_insert on public.wx_tasks
  for insert to anon, authenticated with check (true);

-- 다시 실행해도 같은 초기 일정을 중복해서 추가하지 않습니다.
insert into public.wx_tasks (title, region, kind, owner)
select seed.title, seed.region, seed.kind, seed.owner
from (values
  (1, '다중이용시설 안전점검', '세종', '야외', '김안전'),
  (2, '시민 안전체험 행사 운영', '보령', '야외', '이행사'),
  (3, '옥상 태양광 설비 점검', '태안', '고소', '박설비'),
  (4, '하천 수위계 확인', '대전', '야외', '최현장'),
  (5, '청사 외벽 간판 보수', '세종', '고소', '정시설'),
  (6, '비상연락 훈련', '대전', '실내', '한상황')
) as seed(position, title, region, kind, owner)
where not exists (
  select 1 from public.wx_tasks as existing
  where existing.title = seed.title and existing.region = seed.region
    and existing.kind = seed.kind and existing.owner = seed.owner
)
order by seed.position;

commit;
