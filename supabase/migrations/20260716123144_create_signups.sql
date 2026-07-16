-- Create the signups table.
-- id (uuid) and created_at (timestamptz) are added automatically here;
-- name and email are required, message is optional.
create table if not exists public.signups (
    id         uuid        primary key default gen_random_uuid(),
    name       text        not null,
    email      text        not null,
    message    text,
    created_at timestamptz not null default now()
);

-- Disable Row Level Security on the table for now.
alter table public.signups disable row level security;
