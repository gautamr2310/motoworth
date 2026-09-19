-- MotoWorth V2 — normalized PostgreSQL/Supabase schema
create extension if not exists pgcrypto;

create table if not exists sources (
  id text primary key,
  name text not null,
  source_type text not null check (source_type in ('manufacturer','secondary_marketplace','secondary_reference','secondary_historical','user_reported_example','other')),
  url text,
  retrieved_at date not null,
  notes text
);

create table if not exists manufacturers (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  country text,
  vehicle_type text not null default 'motorcycle' check (vehicle_type in ('motorcycle','scooter','mixed')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists models (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references manufacturers(id),
  slug text not null,
  name text not null,
  vehicle_type text not null check (vehicle_type in ('motorcycle','scooter')),
  body_style text,
  engine_cc numeric,
  electric boolean not null default false,
  launch_year int,
  discontinue_year int,
  active boolean not null default true,
  data_status text not null default 'catalogue_only' check (data_status in ('catalogue_only','verified_reference','production_ready')),
  unique(manufacturer_id, slug)
);

create table if not exists generations (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models(id),
  generation_name text not null,
  start_year int,
  end_year int,
  change_type text,
  notes text
);

create table if not exists variants (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models(id),
  generation_id uuid references generations(id),
  slug text not null,
  name text not null,
  abs_type text,
  transmission text,
  fuel_type text,
  battery_kwh numeric,
  active boolean not null default true,
  unique(model_id, slug)
);

create table if not exists specifications (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models(id),
  variant_id uuid references variants(id),
  field_name text not null,
  numeric_value numeric,
  text_value text,
  unit text,
  effective_from date not null,
  effective_to date,
  source_id text references sources(id),
  confidence text not null default 'medium' check (confidence in ('high','medium','low')),
  unique(model_id, variant_id, field_name, effective_from)
);

create table if not exists price_history (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid references variants(id),
  model_id uuid not null references models(id),
  market_country char(2) not null default 'IN',
  city text,
  price_basis text not null check (price_basis in ('ex_showroom','on_road','invoice')),
  amount_inr numeric not null,
  effective_from date not null,
  effective_to date,
  source_id text references sources(id),
  confidence text not null default 'medium' check (confidence in ('high','medium','low')),
  status text not null default 'verified_reference' check (status in ('verified_reference','historical','last_recorded','estimated')),
  metadata jsonb default '{}'::jsonb
);

create table if not exists market_comps (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid references variants(id),
  model_id uuid not null references models(id),
  city text,
  source_id text references sources(id),
  source_listing_id text,
  listing_url text,
  seller_type text check (seller_type in ('owner','dealer','unknown')),
  registration_year int,
  km int,
  asking_price_inr numeric,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  status text default 'active' check (status in ('active','sold','expired','unknown')),
  verified boolean not null default false,
  confidence text not null default 'low' check (confidence in ('high','medium','low')),
  metadata jsonb default '{}'::jsonb
);

create table if not exists valuation_methodologies (
  version text primary key,
  published_at date not null,
  rules jsonb not null,
  notes text
);

create table if not exists valuations (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models(id),
  variant_id uuid references variants(id),
  city text,
  registration_year int not null,
  km int not null,
  seller_type text check (seller_type in ('owner','dealer','unknown')),
  condition text,
  owners_count int,
  service_history text,
  accident_history text,
  insurance_expired boolean,
  wear_items jsonb default '{}'::jsonb,
  modifications text,
  asking_price_inr numeric,
  benchmark_new_price_inr numeric,
  market_comp_count int not null default 0,
  fair_low_inr numeric,
  fair_high_inr numeric,
  opening_offer_inr numeric,
  target_close_inr numeric,
  walkaway_inr numeric,
  repair_reserve_inr numeric,
  confidence text,
  methodology_version text references valuation_methodologies(version),
  created_at timestamptz not null default now()
);

create table if not exists inspections (
  id uuid primary key default gen_random_uuid(),
  valuation_id uuid references valuations(id),
  checklist_version text not null,
  score numeric,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists listing_analyses (
  id uuid primary key default gen_random_uuid(),
  listing_url text,
  valuation_id uuid references valuations(id),
  extracted_payload jsonb default '{}'::jsonb,
  parse_status text not null default 'manual' check (parse_status in ('manual','parsed','failed','pending')),
  created_at timestamptz not null default now()
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  valuation_id uuid references valuations(id),
  contact_type text check (contact_type in ('whatsapp','email')),
  contact_value text not null,
  consent boolean not null default false,
  source text,
  created_at timestamptz not null default now()
);

create index if not exists idx_models_manufacturer on models(manufacturer_id);
create index if not exists idx_variants_model on variants(model_id);
create index if not exists idx_price_model_city_date on price_history(model_id, city, effective_from desc);
create index if not exists idx_comps_model_city_date on market_comps(model_id, city, last_seen_at desc);
create index if not exists idx_valuations_model_date on valuations(model_id, created_at desc);
