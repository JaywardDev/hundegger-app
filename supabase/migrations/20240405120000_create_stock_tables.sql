-- Migration: create tables for stock matrix storage
-- Description: Defines stock_cells and stock_items tables.

create table if not exists public.stock_cells (
    id uuid primary key default gen_random_uuid(),
    area_id text not null default 'default',
    bay_code text not null,
    level_code text not null,
    locked boolean not null default false,
    updated_at timestamptz not null default now(),
    updated_by text,
    constraint stock_cells_area_bay_level_key unique (area_id, bay_code, level_code)
);

create table if not exists public.stock_items (
    id uuid primary key default gen_random_uuid(),
    cell_id uuid not null references public.stock_cells(id) on delete cascade,
    size_id text,
    width_mm integer,
    thickness_mm integer,
    length_mm integer,
    grade text,
    treatment text,
    pieces integer,
    bundle_id text,
    notes text,
    position integer
);