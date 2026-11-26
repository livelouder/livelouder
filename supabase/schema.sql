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

-- Friends (added 27 Nov 2026). One-way follows, like Instagram. Profiles are private until the person
-- switches "Share my profile" on. Other people only ever see a profile through the functions below,
-- which return nothing for private profiles and never return email addresses.
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists share boolean not null default false;
create unique index if not exists profiles_username_key on public.profiles (lower(username));
alter table public.profiles drop constraint if exists username_ok;
alter table public.profiles add constraint username_ok check (username is null or username ~ '^[a-z0-9_]{3,24}$');
alter table public.profiles drop constraint if exists display_name_ok;
alter table public.profiles add constraint display_name_ok check (display_name is null or char_length(display_name) <= 40);

create table if not exists public.follows (
  follower uuid not null references auth.users(id) on delete cascade,
  followee uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
alter table public.follows enable row level security;
drop policy if exists "see own follows" on public.follows;
create policy "see own follows" on public.follows for select to authenticated
  using ((select auth.uid()) in (follower, followee));
-- Unfollow someone, or remove someone who follows you.
drop policy if exists "remove own follows" on public.follows;
create policy "remove own follows" on public.follows for delete to authenticated
  using ((select auth.uid()) in (follower, followee));
grant select, delete on public.follows to authenticated;

-- Shared building block: one person's public card.
create or replace function public.person_card(pid uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'username', p.username,
    'name', case when p.share then coalesce(nullif(p.display_name, ''), u.raw_user_meta_data->>'full_name', p.username) else p.username end,
    'avatar', case when p.share then u.raw_user_meta_data->>'avatar_url' end,
    'shared', p.share and p.username is not null,
    'records', case when p.share then (select count(*) from public.user_records r where r.user_id = p.id and r.list = 'collection') else 0 end,
    'going', case when p.share then coalesce((select jsonb_agg(g.gig || jsonb_build_object('id', g.gig_id) order by g.gig->>'d')
        from (select * from public.saved_gigs s where s.user_id = p.id and s.going
              and (s.gig->>'d') >= to_char(now() at time zone 'Australia/Sydney', 'YYYY-MM-DD') order by s.gig->>'d' limit 6) g), '[]'::jsonb) else '[]'::jsonb end)
  from public.profiles p join auth.users u on u.id = p.id where p.id = pid
$$;
revoke all on function public.person_card(uuid) from public, anon, authenticated;

-- A shared profile, for /u/<username>. Anyone with the link can see a shared profile.
create or replace function public.public_profile(uname text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p public.profiles; me uuid := auth.uid(); today text := to_char(now() at time zone 'Australia/Sydney', 'YYYY-MM-DD');
begin
  select * into p from public.profiles where lower(username) = lower(uname);
  if not found then return null; end if;
  if not p.share and p.id is distinct from me then return jsonb_build_object('private', true, 'username', p.username); end if;
  return public.person_card(p.id) || jsonb_build_object(
    'me', p.id = me,
    'shared', p.share,
    'since', (select created_at from auth.users where id = p.id),
    'following', exists (select 1 from public.follows where follower = me and followee = p.id),
    'follows_you', exists (select 1 from public.follows where follower = p.id and followee = me),
    'n_followers', (select count(*) from public.follows where followee = p.id),
    'n_following', (select count(*) from public.follows where follower = p.id),
    'gigs', coalesce((select jsonb_agg(s.gig || jsonb_build_object('id', s.gig_id, 'going', s.going) order by s.gig->>'d')
        from public.saved_gigs s where s.user_id = p.id and (s.gig->>'d') >= today), '[]'::jsonb),
    'been', coalesce((select jsonb_agg(x.g order by x.g->>'d' desc) from (select s.gig || jsonb_build_object('id', s.gig_id) g
        from public.saved_gigs s where s.user_id = p.id and s.going and (s.gig->>'d') < today order by s.gig->>'d' desc limit 40) x), '[]'::jsonb),
    'collection', coalesce((select jsonb_agg(x.rec) from (select rec from public.user_records where user_id = p.id and list = 'collection' order by created_at desc limit 1500) x), '[]'::jsonb),
    'wants', coalesce((select jsonb_agg(x.rec) from (select rec from public.user_records where user_id = p.id and list = 'wantlist' order by created_at desc limit 1500) x), '[]'::jsonb),
    'n_wants', (select count(*) from public.user_records where user_id = p.id and list = 'wantlist'));
end $$;
revoke all on function public.public_profile(text) from public;
grant execute on function public.public_profile(text) to anon, authenticated;

-- Find people by name or username (shared profiles only, signed-in people only).
create or replace function public.find_people(q text) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.person_card(x.id) || jsonb_build_object('following', exists (select 1 from public.follows f where f.follower = auth.uid() and f.followee = x.id))), '[]'::jsonb)
  from (select p.id from public.profiles p join auth.users u on u.id = p.id
        where p.share and p.username is not null and p.id <> auth.uid() and char_length(trim(q)) >= 2
          and (p.username ilike '%' || trim(q) || '%' or p.display_name ilike '%' || trim(q) || '%' or u.raw_user_meta_data->>'full_name' ilike '%' || trim(q) || '%')
        order by (lower(p.username) = lower(trim(q))) desc, p.username limit 20) x
$$;
revoke all on function public.find_people(text) from public, anon;
grant execute on function public.find_people(text) to authenticated;

-- Who I follow and who follows me. Followers with private profiles are only counted.
create or replace function public.my_people() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'following', coalesce((select jsonb_agg(public.person_card(f.followee) order by f.created_at desc) from public.follows f where f.follower = auth.uid()), '[]'::jsonb),
    'followers', coalesce((select jsonb_agg(public.person_card(f.follower) || jsonb_build_object('following', exists (select 1 from public.follows b where b.follower = auth.uid() and b.followee = f.follower)) order by f.created_at desc)
        from public.follows f join public.profiles p on p.id = f.follower where f.followee = auth.uid() and p.share and p.username is not null), '[]'::jsonb),
    'private_followers', (select count(*) from public.follows f join public.profiles p on p.id = f.follower where f.followee = auth.uid() and not (p.share and p.username is not null)))
$$;
revoke all on function public.my_people() from public, anon;
grant execute on function public.my_people() to authenticated;

-- Follow and unfollow by username. You can only follow profiles that are shared.
create or replace function public.follow_user(uname text) returns boolean language plpgsql security definer set search_path = '' as $$
declare t uuid; me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first'; end if;
  select id into t from public.profiles where lower(username) = lower(uname) and share;
  if t is null or t = me then return false; end if;
  if (select count(*) from public.follows where follower = me) >= 2000 then raise exception 'Following too many people'; end if;
  insert into public.follows (follower, followee) values (me, t) on conflict do nothing;
  return true;
end $$;
create or replace function public.unfollow_user(uname text, remove_follower boolean default false) returns void language plpgsql security definer set search_path = '' as $$
declare t uuid; me uuid := auth.uid();
begin
  select id into t from public.profiles where lower(username) = lower(uname);
  if remove_follower then delete from public.follows where follower = t and followee = me;
  else delete from public.follows where follower = me and followee = t; end if;
end $$;
revoke all on function public.follow_user(text) from public, anon;
revoke all on function public.unfollow_user(text, boolean) from public, anon;
grant execute on function public.follow_user(text) to authenticated;
grant execute on function public.unfollow_user(text, boolean) to authenticated;
