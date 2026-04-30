-- Run this in Supabase SQL editor
-- Creates tables for the Explore page chip bar redesign

-- 1. Type buckets (plain-language labels shown in the Type chip sheet)
create table if not exists explore_type_buckets (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  icon_key text null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. Category mappings for each bucket
create table if not exists explore_bucket_categories (
  id uuid primary key default gen_random_uuid(),
  bucket_id uuid not null references explore_type_buckets(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  unique(bucket_id, category_id)
);

create index if not exists idx_explore_bucket_categories_bucket_id
  on explore_bucket_categories(bucket_id);

-- 3. Popular sites stored in existing app_settings table
-- key: "explore_popular_sites", value: { "site_ids": ["uuid1", "uuid2", ...] }
insert into app_settings (key, value)
values ('explore_popular_sites', '{"site_ids": []}')
on conflict (key) do nothing;

-- RLS: allow public read on buckets and bucket_categories
alter table explore_type_buckets enable row level security;
alter table explore_bucket_categories enable row level security;

create policy "Public can read active buckets"
  on explore_type_buckets for select
  using (is_active = true);

create policy "Admins can do all on buckets"
  on explore_type_buckets for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.is_admin = true
    )
  );

create policy "Public can read bucket categories"
  on explore_bucket_categories for select
  using (true);

create policy "Admins can do all on bucket categories"
  on explore_bucket_categories for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.is_admin = true
    )
  );
