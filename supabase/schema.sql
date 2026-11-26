-- =====================================================================
--  물품구매 관리 대시보드 - Supabase 설정 SQL
--  Supabase 대시보드 > SQL Editor > New query 에 전체를 붙여넣고 Run 하세요.
-- =====================================================================

-- ---------- 1. 권한 종류 ----------
create type public.user_role as enum ('pending', 'user', 'admin', 'superadmin', 'rejected');

-- ---------- 2. 테이블 ----------
create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  email       text not null,
  full_name   text not null,
  role        public.user_role not null default 'pending',
  created_at  timestamptz not null default now()
);

create table public.budgets (
  id            bigint generated always as identity primary key,
  fiscal_year   int    not null,
  name          text   not null,
  total_amount  bigint not null check (total_amount >= 0),
  note          text,
  created_at    timestamptz not null default now()
);

create table public.purchase_requests (
  id           bigint generated always as identity primary key,
  requester_id uuid   not null default auth.uid() references public.profiles(id),
  item_name    text   not null,
  spec         text,
  quantity     int    not null default 1 check (quantity > 0),
  unit_price   bigint not null default 0 check (unit_price >= 0),
  amount       bigint not null default 0 check (amount >= 0),
  reason       text,
  budget_id    bigint references public.budgets(id) on delete set null,
  step         text   not null default '신청',
  file_path    text,
  file_name    text,
  admin_memo   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.request_history (
  id          bigint generated always as identity primary key,
  request_id  bigint not null references public.purchase_requests(id) on delete cascade,
  from_step   text,
  to_step     text not null,
  changed_by  uuid references public.profiles(id),
  changed_at  timestamptz not null default now()
);

create table public.site_settings (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now()
);
insert into public.site_settings (key, value)
values ('notice', '물품 구입이 필요하면 [물품 신청 내역]에서 신청서를 첨부해 신청해 주세요.');

create index on public.purchase_requests (step);
create index on public.purchase_requests (requester_id);
create index on public.purchase_requests (budget_id);
create index on public.request_history (request_id);

-- ---------- 3. 현재 로그인한 사람의 권한 ----------
create or replace function public.my_role()
returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ---------- 4. 가입 시 profiles 자동 생성 (승인 대기 상태) ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), '(이름 없음)'));
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------- 5. 물품 신청 보호 규칙 ----------
-- 사용자는 진행단계, 예산항목, 관리자 메모를 바꿀 수 없음
create or replace function public.before_request_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.requester_id := auth.uid();
  if coalesce(public.my_role()::text, '') not in ('admin', 'superadmin') then
    new.step := '신청';
    new.budget_id := null;
    new.admin_memo := null;
  end if;
  new.amount := new.quantity * new.unit_price;
  return new;
end $$;

create trigger trg_request_before_insert
before insert on public.purchase_requests
for each row execute function public.before_request_insert();

create or replace function public.before_request_update()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.my_role()::text, '') not in ('admin', 'superadmin') then
    if new.step is distinct from old.step
       or new.budget_id is distinct from old.budget_id
       or new.admin_memo is distinct from old.admin_memo
       or new.requester_id is distinct from old.requester_id then
      raise exception '진행단계, 예산항목, 관리자 메모는 관리자만 변경할 수 있습니다.';
    end if;
  end if;
  new.requester_id := old.requester_id;
  new.amount := new.quantity * new.unit_price;
  new.updated_at := now();
  if new.step is distinct from old.step then
    insert into public.request_history (request_id, from_step, to_step, changed_by)
    values (old.id, old.step, new.step, auth.uid());
  end if;
  return new;
end $$;

create trigger trg_request_before_update
before update on public.purchase_requests
for each row execute function public.before_request_update();

create or replace function public.after_request_insert()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.request_history (request_id, from_step, to_step, changed_by)
  values (new.id, null, new.step, auth.uid());
  return new;
end $$;

create trigger trg_request_after_insert
after insert on public.purchase_requests
for each row execute function public.after_request_insert();

-- ---------- 6. 행 수준 보안(RLS) ----------
alter table public.profiles          enable row level security;
alter table public.budgets           enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.request_history   enable row level security;
alter table public.site_settings     enable row level security;

-- profiles: 본인 또는 승인된 회원이 조회 / 권한 변경은 최고관리자만
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.my_role() in ('user', 'admin', 'superadmin'));
create policy profiles_update on public.profiles for update
  using (public.my_role() = 'superadmin')
  with check (public.my_role() = 'superadmin');
create policy profiles_delete on public.profiles for delete
  using (public.my_role() = 'superadmin');

-- 물품 신청: 승인된 회원 전체 조회 / 본인 명의로 신청
create policy req_select on public.purchase_requests for select
  using (public.my_role() in ('user', 'admin', 'superadmin'));
create policy req_insert on public.purchase_requests for insert
  with check (public.my_role() in ('user', 'admin', 'superadmin'));
-- 수정: 본인 건이 '신청' 단계일 때, 또는 관리자 이상
create policy req_update on public.purchase_requests for update
  using ((requester_id = auth.uid() and step = '신청') or public.my_role() in ('admin', 'superadmin'))
  with check ((requester_id = auth.uid()) or public.my_role() in ('admin', 'superadmin'));
create policy req_delete on public.purchase_requests for delete
  using (public.my_role() = 'superadmin');

-- 진행 이력: 승인된 회원 조회 (기록은 트리거가 함)
create policy hist_select on public.request_history for select
  using (public.my_role() in ('user', 'admin', 'superadmin'));

-- 예산: 관리자 이상 조회 / 최고관리자만 수정
create policy budget_select on public.budgets for select
  using (public.my_role() in ('admin', 'superadmin'));
create policy budget_insert on public.budgets for insert
  with check (public.my_role() = 'superadmin');
create policy budget_update on public.budgets for update
  using (public.my_role() = 'superadmin') with check (public.my_role() = 'superadmin');
create policy budget_delete on public.budgets for delete
  using (public.my_role() = 'superadmin');

-- 공지사항: 승인된 회원 조회 / 최고관리자만 수정
create policy settings_select on public.site_settings for select
  using (public.my_role() in ('user', 'admin', 'superadmin'));
create policy settings_insert on public.site_settings for insert
  with check (public.my_role() = 'superadmin');
create policy settings_update on public.site_settings for update
  using (public.my_role() = 'superadmin') with check (public.my_role() = 'superadmin');

-- ---------- 7. 첨부파일 저장소 ----------
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- 업로드: 승인된 회원이 본인 폴더(사용자ID/)에만
create policy att_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.my_role() in ('user', 'admin', 'superadmin')
  );
-- 내려받기: 본인 파일 또는 관리자 이상
create policy att_select on storage.objects for select to authenticated
  using (
    bucket_id = 'attachments'
    and ((storage.foldername(name))[1] = auth.uid()::text
         or public.my_role() in ('admin', 'superadmin'))
  );
-- 삭제: 최고관리자
create policy att_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and public.my_role() = 'superadmin');

-- =====================================================================
--  8. 첫 최고관리자 지정
--  사이트에서 본인 이메일로 먼저 가입(메일 링크 클릭)한 뒤,
--  아래 줄의 이메일을 바꿔서 한 번만 실행하세요.
-- =====================================================================
-- update public.profiles set role = 'superadmin' where email = 'your-email@example.go.kr';
