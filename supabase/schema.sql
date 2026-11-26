-- Live Louder accounts. Run once in the Supabase SQL editor (safe to re-run).
-- Every table has row level security: people can only ever see and change their own rows.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  city text,
  discogs text,
  remind_gigs boolean not null default true,      -- "a gig you saved is coming up"
  remind_presales boolean not null default true,  -- "presale tomorrow for an artist you follow"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_gigs (
  user_id uuid not null references auth.users(id) on delete cascade,
  gig_id text not null,
  gig jsonb not null,             -- snapshot: date, artist, venue, city, ticket link
  going boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, gig_id)
);

create table if not exists public.followed_artists (
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null,
  name text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, slug)
);

-- Which reminder emails have gone out, so nobody gets the same one twice. Only the site's server code can touch it.
create table if not exists public.sent_reminders (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.profiles enable row level security;
alter table public.saved_gigs enable row level security;
alter table public.followed_artists enable row level security;
alter table public.sent_reminders enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop policy if exists "own saved gigs" on public.saved_gigs;
create policy "own saved gigs" on public.saved_gigs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "own followed artists" on public.followed_artists;
create policy "own followed artists" on public.followed_artists for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.profiles, public.saved_gigs, public.followed_artists to authenticated;
revoke all on public.sent_reminders from anon, authenticated;

-- Keep each person's lists to a sensible size.
create or replace function public.limit_rows() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'saved_gigs' and (select count(*) from public.saved_gigs where user_id = new.user_id) >= 500 then
    raise exception 'Too many saved gigs';
  elsif tg_table_name = 'followed_artists' and (select count(*) from public.followed_artists where user_id = new.user_id) >= 1000 then
    raise exception 'Too many followed artists';
  end if;
  return new;
end $$;
drop trigger if exists limit_saved on public.saved_gigs;
create trigger limit_saved before insert on public.saved_gigs for each row execute function public.limit_rows();
drop trigger if exists limit_followed on public.followed_artists;
create trigger limit_followed before insert on public.followed_artists for each row execute function public.limit_rows();

-- A profile row for every new account.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- "Delete my account": removes the person and (through the cascades) everything they saved.
create or replace function public.delete_my_account() returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from auth.users where id = (select auth.uid());
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Record collection and wantlist kept on Live Louder (added 26 Nov 2026).
create table if not exists public.user_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  list text not null check (list in ('collection', 'wantlist')),
  rid text not null,            -- "m123" (Discogs master) or "r456" (Discogs release)
  rec jsonb not null,           -- artist, title, year, cover, label, format
  created_at timestamptz not null default now(),
  primary key (user_id, list, rid)
);
alter table public.user_records enable row level security;
drop policy if exists "own records" on public.user_records;
create policy "own records" on public.user_records for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.user_records to authenticated;
create or replace function public.limit_records() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.user_records where user_id = new.user_id) >= 6000 then
    raise exception 'Too many records';
  end if;
  return new;
end $$;
drop trigger if exists limit_records on public.user_records;
create trigger limit_records before insert on public.user_records for each row execute function public.limit_records();
