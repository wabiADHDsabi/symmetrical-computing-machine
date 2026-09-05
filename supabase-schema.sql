-- Letters to Son — Full Schema (run this fresh in Supabase SQL Editor)

-- Entries
create table if not exists entries (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  body       text not null,
  body_md    text not null default ''
);

-- Media (simple — signed URL stored permanently)
drop table if exists media cascade;
create table media (
  id           uuid primary key default gen_random_uuid(),
  entry_id     uuid not null references entries(id) on delete cascade,
  created_at   timestamptz not null default now(),
  filename     text not null,
  mime_type    text not null,
  storage_path text not null,
  signed_url   text not null,
  position     int  not null default 0
);
create index if not exists media_entry_id_idx on media(entry_id);

-- Config (password hash, settings)
create table if not exists config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- RLS
alter table entries enable row level security;
alter table media   enable row level security;
alter table config  enable row level security;

drop policy if exists "allow_all_entries" on entries;
drop policy if exists "allow_all_media"   on media;
drop policy if exists "allow_all_config"  on config;
create policy "allow_all_entries" on entries for all using (true) with check (true);
create policy "allow_all_media"   on media   for all using (true) with check (true);
create policy "allow_all_config"  on config  for all using (true) with check (true);

-- Auto updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists entries_updated_at on entries;
create trigger entries_updated_at before update on entries for each row execute procedure set_updated_at();

-- Storage: create a private bucket named "media" in Supabase dashboard,
-- then run this policy:
insert into storage.buckets(id,name,public) values('media','media',false) on conflict(id) do nothing;
drop policy if exists "allow_anon_all" on storage.objects;
create policy "allow_anon_all" on storage.objects for all to anon using(bucket_id='media') with check(bucket_id='media');
