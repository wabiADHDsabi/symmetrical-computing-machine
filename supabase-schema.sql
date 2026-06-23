-- ─────────────────────────────────────────────────────────────────
-- Letters to Son — Supabase Schema v2
-- Run in: Dashboard → SQL Editor → New query → Run
-- If upgrading from v1, run the ALTER TABLE section at the bottom.
-- ─────────────────────────────────────────────────────────────────

-- Entries table
create table if not exists entries (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  body       text not null,
  body_md    text not null
);

-- Media table — each row is one photo/video attached to an entry.
-- `sources` is a JSONB array of backup locations, tried in order.
--
-- Each source object:
--   { "type": "supabase", "path": "entries/uuid/file.mp4" }
--   { "type": "gdrive",   "id":   "1BxiMVs0XRA..." }
--   { "type": "url",      "href": "https://..." }
--   { "type": "local",    "filename": "first-steps.mp4" }
--
create table if not exists media (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references entries(id) on delete cascade,
  created_at  timestamptz not null default now(),
  filename    text not null,          -- canonical filename e.g. "first-steps.mp4"
  mime_type   text not null,
  position    int  not null default 0,
  sources     jsonb not null default '[]'::jsonb
);

create index if not exists media_entry_id_idx on media(entry_id);

-- Auto-update updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists entries_updated_at on entries;
create trigger entries_updated_at
  before update on entries
  for each row execute procedure set_updated_at();

-- RLS (you are the only user)
alter table entries enable row level security;
alter table media    enable row level security;

drop policy if exists "allow_all_entries" on entries;
drop policy if exists "allow_all_media"   on media;
create policy "allow_all_entries" on entries for all using (true) with check (true);
create policy "allow_all_media"   on media    for all using (true) with check (true);

-- ── Upgrading from v1? Run this instead of the full script: ───────
-- alter table media add column if not exists filename text not null default '';
-- alter table media add column if not exists sources  jsonb not null default '[]';
-- alter table media drop column if exists storage_path;
