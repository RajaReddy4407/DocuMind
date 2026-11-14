-- DocuMind AI — Supabase schema
-- Run in Supabase Dashboard -> SQL Editor.

create extension if not exists "pgcrypto";

-- Cleanly reset existing tables if they were created with a different schema in an earlier project
drop table if exists public.documents cascade;
drop table if exists public.users cascade;

create table public.users (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null unique,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  filename      text not null,
  mime_type     text,
  file_size     integer,
  doc_type      text not null default 'unknown'
                check (doc_type in ('purchase_order','delivery_receipt','invoice','unknown')),
  status        text not null default 'processing'
                check (status in ('processing','processed','needs_review','mismatch','matched','failed')),
  extracted     jsonb,           -- structured fields from Gemini (editable by user)
  validation    jsonb,           -- latest three-way-match result for this document's PO group
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index documents_user_id_idx      on public.documents(user_id);
create index documents_user_created_idx on public.documents(user_id, created_at desc);

-- Enable RLS with policies that allow backend API access while Express enforces user_id = req.user.id
alter table public.users     enable row level security;
alter table public.documents enable row level security;

create policy "backend_users_all"     on public.users     for all using (true) with check (true);
create policy "backend_documents_all" on public.documents for all using (true) with check (true);
