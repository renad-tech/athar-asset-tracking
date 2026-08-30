-- ═══════════════════════════════════════════════════════════════════════════
--  ATHAR (أثر) — Supabase Database Schema
--  How to use:
--    1. Go to https://supabase.com/dashboard → your project → SQL Editor
--    2. Paste this whole file → click "Run"
--    3. Done. Tables + sample data + storage bucket are created.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Supervisors (campus security officers) ──────────────────────────────────
create table if not exists supervisors (
  badge_id    text primary key,
  name        text not null,
  role        text,
  clearance   text,
  unit        text,
  shift       text,
  created_at  timestamptz default now()
);

-- ─── Incidents ────────────────────────────────────────────────────────────────
create table if not exists incidents (
  id              text primary key,               -- e.g. INC-2024-0847
  date            timestamptz default now(),
  location        text,
  type            text,
  priority        text,                            -- e.g. 'HIGH — ...'
  priority_color  text default 'red',               -- red | blue | green
  status          text,
  ai_accuracy     text,
  unregistered    text,
  permits         text,
  first_alert     text,
  duration        text,
  cam_id          text,
  sector          text,
  officer_badge   text references supervisors(badge_id),
  files           text[] default '{}',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ─── Reports (generated at end of a patrol session) ──────────────────────────
create table if not exists reports (
  id              uuid primary key default gen_random_uuid(),
  incident_id     text references incidents(id),
  officer_badge   text references supervisors(badge_id),
  format          text,                             -- PDF | CSV | JSON | DOC
  file_url        text,                              -- Supabase Storage public URL
  hash            text,                              -- SHA-256 for integrity display
  created_at      timestamptz default now()
);

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- For a hackathon demo, we allow the anon key to read/write everything.
-- (In a real production system you'd restrict this to authenticated officers.)
alter table supervisors enable row level security;
alter table incidents   enable row level security;
alter table reports     enable row level security;

create policy "Public read supervisors" on supervisors for select using (true);
create policy "Public write supervisors" on supervisors for insert with check (true);

create policy "Public read incidents" on incidents for select using (true);
create policy "Public write incidents" on incidents for insert with check (true);
create policy "Public update incidents" on incidents for update using (true);

create policy "Public read reports" on reports for select using (true);
create policy "Public write reports" on reports for insert with check (true);

-- ─── Storage bucket for photos / exported files ──────────────────────────────
insert into storage.buckets (id, name, public)
values ('athar-reports', 'athar-reports', true)
on conflict (id) do nothing;

create policy "Public read athar-reports"
  on storage.objects for select
  using (bucket_id = 'athar-reports');

create policy "Public upload athar-reports"
  on storage.objects for insert
  with check (bucket_id = 'athar-reports');

-- ─── Sample data (so the app has something to show immediately) ─────────────
insert into supervisors (badge_id, name, role, clearance, unit, shift) values
  ('BADGE-2024-0849', '[اسم المشرف]', 'مشرف الأمن الجامعي', 'صلاحية: المباني الأكاديمية', 'وحدة السلامة والأمن الجامعي', '0700 – 1900')
on conflict (badge_id) do nothing;

insert into incidents (id, date, location, type, priority, priority_color, status, ai_accuracy, unregistered, permits, first_alert, duration, cam_id, sector, officer_badge, files) values
  ('INC-2024-0847', now(), 'البوابة الرئيسية — الحرم الجامعي، المدخل الشرقي', 'دخول غير مصرح للحرم الجامعي', 'HIGH — استجابة فورية مطلوبة', 'red', 'قيد المتابعة — ACTIVE', '97.3% — شخص غير مُسجَّل', '3', '0 تصريح نشط', '09:41:53', '0h 24m', 'CAM-042', 'Main Gate · Campus Perimeter', 'BADGE-2024-0849', array['IMG_Campus_0847_001.jpg','VID_Gate_0847_001.mp4','AUD_Incident_0847.aac'])
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
--  PHASE 1 ADDITION — Employees registry (سجل الموظفين المصرح لهم)
--  Safe to re-run: everything uses "if not exists" / "on conflict do nothing".
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists employees (
  emp_id      text primary key,          -- الرقم الوظيفي (this is what the QR badge encodes)
  name        text not null,             -- الاسم
  role        text,                      -- المسمى الوظيفي
  department  text,                      -- القسم
  photo_url   text,                      -- رابط الصورة في Supabase Storage
  authorized  boolean default true,      -- مصرح له بالدخول؟
  created_at  timestamptz default now()
);

alter table employees enable row level security;

drop policy if exists "Public read employees"   on employees;
drop policy if exists "Public write employees"  on employees;
drop policy if exists "Public update employees" on employees;
drop policy if exists "Public delete employees" on employees;

create policy "Public read employees"   on employees for select using (true);
create policy "Public write employees"  on employees for insert with check (true);
create policy "Public update employees" on employees for update using (true);
create policy "Public delete employees" on employees for delete using (true);

-- Sample employees so the AI has someone to recognise on day one
insert into employees (emp_id, name, role, department, authorized) values
  ('EMP-1001', 'أحمد الشمري',  'فني مختبر',      'المعامل المركزية',      true),
  ('EMP-1002', 'سارة القحطاني', 'باحثة',          'كلية العلوم',           true),
  ('EMP-1003', 'خالد العتيبي',  'موظف صيانة',     'الخدمات المساندة',      true)
on conflict (emp_id) do nothing;
