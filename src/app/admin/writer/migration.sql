-- Run this in your Supabase SQL editor
-- Creates the writer_documents table for the Writer feature

create table if not exists writer_documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade not null,
  title       text not null default 'Untitled Document',
  content     jsonb,
  word_count  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-update updated_at on every row change
create or replace function update_writer_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists writer_documents_updated_at on writer_documents;
create trigger writer_documents_updated_at
before update on writer_documents
for each row execute procedure update_writer_updated_at();

-- Row-Level Security
alter table writer_documents enable row level security;

-- Admins can read/write all documents
create policy "Admins full access to writer_documents"
on writer_documents for all
using (
  exists (
    select 1 from profiles where id = auth.uid() and is_admin = true
  )
)
with check (
  exists (
    select 1 from profiles where id = auth.uid() and is_admin = true
  )
);

-- Index for fast listing by user
create index if not exists writer_documents_user_updated
on writer_documents (user_id, updated_at desc);
