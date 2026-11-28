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
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists banner_url text;
alter table public.profiles add column if not exists avatar_status text not null default 'ok';
alter table public.profiles add column if not exists banner_status text not null default 'ok';
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
    'avatar', case when p.share and p.avatar_status in ('ok', 'approved') then coalesce(p.avatar_url, u.raw_user_meta_data->>'avatar_url') end,
    'banner', case when p.share and p.banner_status in ('ok', 'approved') then p.banner_url end,
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
    'been', public.gig_diary(p.id),
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

-- Profile photo and cover banner (added 27 Nov 2026). Pictures are stored in Supabase Storage, in a folder
-- named after the person's account. People can only add, change or remove files in their own folder.
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists banner_url text;
alter table public.profiles drop constraint if exists photo_urls_ok;
alter table public.profiles add constraint photo_urls_ok check (
  (avatar_url is null or avatar_url like 'https://qoqdouthyyaebmreavgz.supabase.co/storage/v1/object/public/profile/%')
  and (banner_url is null or banner_url like 'https://qoqdouthyyaebmreavgz.supabase.co/storage/v1/object/public/profile/%'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile', 'profile', true, 3145728, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg', 'image/webp', 'image/png'];

drop policy if exists "profile pics: add own" on storage.objects;
create policy "profile pics: add own" on storage.objects for insert to authenticated
  with check (bucket_id = 'profile' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "profile pics: change own" on storage.objects;
create policy "profile pics: change own" on storage.objects for update to authenticated
  using (bucket_id = 'profile' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "profile pics: remove own" on storage.objects;
create policy "profile pics: remove own" on storage.objects for delete to authenticated
  using (bucket_id = 'profile' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "profile pics: list own" on storage.objects;
create policy "profile pics: list own" on storage.objects for select to authenticated
  using (bucket_id = 'profile' and (storage.foldername(name))[1] = (select auth.uid())::text);


-- Sharing on by default for NEW accounts (27 Nov 2026). Accounts made before this keep their own setting.
-- New accounts get a username made from their name (never from their email), e.g. "mickwells" or "gigfan4821".
alter table public.profiles alter column share set default true;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare base text; cand text; n int := 0;
begin
  base := left(lower(regexp_replace(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''), '[^a-zA-Z0-9]+', '', 'g')), 18);
  if char_length(base) < 3 then base := 'gigfan'; end if;
  cand := base;
  while base = 'gigfan' and n = 0 or exists (select 1 from public.profiles where lower(username) = cand) loop
    n := n + 1;
    cand := base || (1000 + floor(random() * 9000))::int;
    if n > 25 then cand := 'fan' || substr(replace(new.id::text, '-', ''), 1, 12); exit; end if;
  end loop;
  insert into public.profiles (id, username, share) values (new.id, cand, true) on conflict do nothing;
  return new;
end $$;

-- Photo safety (27 Nov 2026). Photos are uploaded through the site's own server code (netlify/functions/profile-photo.mjs),
-- which runs Google's SafeSearch check first. Status: ok (checked), approved (Mick kept it after a review),
-- pending (waiting for Mick), hidden (reported, waiting for Mick). Only ok/approved photos are shown to other people.
alter table public.profiles add column if not exists avatar_status text not null default 'ok';
alter table public.profiles add column if not exists banner_status text not null default 'ok';
alter table public.profiles drop constraint if exists photo_status_ok;
alter table public.profiles add constraint photo_status_ok check (avatar_status in ('ok', 'approved', 'pending', 'hidden') and banner_status in ('ok', 'approved', 'pending', 'hidden'));

create table if not exists public.photo_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  kind text, path text, result text, scores jsonb,
  created_at timestamptz not null default now());
create table if not exists public.photo_reports (
  id bigint generated always as identity primary key,
  reporter uuid references auth.users(id) on delete set null,
  owner uuid references auth.users(id) on delete cascade,
  kind text, reason text,
  created_at timestamptz not null default now());
create table if not exists public.photo_blocks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now());
-- Server-only tables: row level security on, and no policies, so the public keys can't read or change them.
alter table public.photo_log enable row level security;
alter table public.photo_reports enable row level security;
alter table public.photo_blocks enable row level security;

-- People can remove their own photo, but only the server can set a photo or its status.
create or replace function public.guard_profile_photos() returns trigger language plpgsql set search_path = '' as $$
begin
  if coalesce(auth.role(), '') in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.avatar_url is not null or new.banner_url is not null or new.avatar_status <> 'ok' or new.banner_status <> 'ok' then
        raise exception 'Photos are uploaded through the site'; end if;
    else
      if (new.avatar_url is distinct from old.avatar_url and new.avatar_url is not null)
         or (new.banner_url is distinct from old.banner_url and new.banner_url is not null)
         or new.avatar_status is distinct from old.avatar_status or new.banner_status is distinct from old.banner_status then
        raise exception 'Photos are uploaded through the site'; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_profile_photos on public.profiles;
create trigger guard_profile_photos before insert or update on public.profiles for each row execute function public.guard_profile_photos();

-- Uploads now go through the server, so people can no longer add files to storage directly (they can still remove their own).
drop policy if exists "profile pics: add own" on storage.objects;
drop policy if exists "profile pics: change own" on storage.objects;


-- Let the site's server code (secret key = service_role) read and write the tables (27 Nov 2026).
-- Browsers still only get what row level security allows.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- Friends feed, gig diary and gig photos (added 27 Nov 2026).
-- saved_gigs gets: when you marked "going" (for the feed), and a rating + short note after the gig.
alter table public.saved_gigs add column if not exists going_at timestamptz;
alter table public.saved_gigs add column if not exists rating smallint;
alter table public.saved_gigs add column if not exists review text;
alter table public.saved_gigs add column if not exists reviewed_at timestamptz;
alter table public.saved_gigs drop constraint if exists rating_ok;
alter table public.saved_gigs add constraint rating_ok check ((rating is null or rating between 1 and 5) and (review is null or char_length(review) <= 280));
update public.saved_gigs set going_at = created_at where going and going_at is null;
create or replace function public.stamp_saved_gig() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.going and (tg_op = 'INSERT' or not coalesce(old.going, false)) then new.going_at := now(); end if;
  if not new.going then new.going_at := null; end if;
  if new.rating is distinct from (case when tg_op = 'UPDATE' then old.rating end)
     or new.review is distinct from (case when tg_op = 'UPDATE' then old.review end) then new.reviewed_at := now(); end if;
  return new;
end $$;
drop trigger if exists stamp_saved_gig on public.saved_gigs;
create trigger stamp_saved_gig before insert or update on public.saved_gigs for each row execute function public.stamp_saved_gig();

-- Gig photos: uploaded only through the site's server code (SafeSearch check, like profile photos). Up to 4 per gig per person.
create table if not exists public.gig_photos (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  gig_id text not null,
  url text not null,
  path text not null,
  status text not null default 'ok' check (status in ('ok', 'approved', 'pending', 'hidden')),
  created_at timestamptz not null default now());
create index if not exists gig_photos_user on public.gig_photos (user_id, gig_id);
alter table public.gig_photos enable row level security;
drop policy if exists "see own gig photos" on public.gig_photos;
create policy "see own gig photos" on public.gig_photos for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "remove own gig photos" on public.gig_photos;
create policy "remove own gig photos" on public.gig_photos for delete to authenticated using ((select auth.uid()) = user_id);
grant select, delete on public.gig_photos to authenticated;
grant all on public.gig_photos to service_role;

-- Who you follow who is shared (helper).
create or replace function public.my_followees() returns setof uuid language sql stable security definer set search_path = '' as $$
  select f.followee from public.follows f join public.profiles p on p.id = f.followee
  where f.follower = auth.uid() and p.share and p.username is not null
$$;
revoke all on function public.my_followees() from public, anon, authenticated;

-- What the people you follow have been up to (last 60 days, newest first).
create or replace function public.friends_feed() returns jsonb language sql stable security definer set search_path = '' as $$
  with f as (select public.my_followees() id),
  who as (select p.id, jsonb_build_object('username', p.username,
            'name', coalesce(nullif(p.display_name, ''), u.raw_user_meta_data->>'full_name', p.username),
            'avatar', case when p.avatar_status in ('ok', 'approved') then coalesce(p.avatar_url, u.raw_user_meta_data->>'avatar_url') end) card
          from public.profiles p join auth.users u on u.id = p.id where p.id in (select id from f)),
  ev as (
    select s.user_id, 'going' t, s.going_at at, s.gig || jsonb_build_object('id', s.gig_id) gig, null::jsonb rec, null::smallint rating, null::text review, null::text photo
      from public.saved_gigs s where s.user_id in (select id from f) and s.going and s.going_at > now() - interval '60 days'
    union all
    select s.user_id, 'review', s.reviewed_at, s.gig || jsonb_build_object('id', s.gig_id), null, s.rating, s.review, null
      from public.saved_gigs s where s.user_id in (select id from f) and s.rating is not null and s.reviewed_at > now() - interval '60 days'
    union all
    select r.user_id, 'record', r.created_at, null, r.rec || jsonb_build_object('rid', r.rid), null, null, null
      from public.user_records r where r.user_id in (select id from f) and r.list = 'collection' and r.created_at > now() - interval '60 days'
    union all
    select g.user_id, 'photo', g.created_at, (select s.gig || jsonb_build_object('id', s.gig_id) from public.saved_gigs s where s.user_id = g.user_id and s.gig_id = g.gig_id), null, null, null, g.url
      from public.gig_photos g where g.user_id in (select id from f) and g.status in ('ok', 'approved') and g.created_at > now() - interval '60 days')
  select coalesce(jsonb_agg(jsonb_build_object('who', w.card, 't', e.t, 'at', e.at, 'gig', e.gig, 'rec', e.rec, 'rating', e.rating, 'review', e.review, 'photo', e.photo) order by e.at desc), '[]'::jsonb)
  from (select * from ev order by at desc limit 400) e join who w on w.id = e.user_id
$$;
revoke all on function public.friends_feed() from public, anon;
grant execute on function public.friends_feed() to authenticated;

-- Which upcoming gigs your friends are going to: {"<gig id>": [{username, name, avatar}, ...]}.
create or replace function public.friends_going() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(x.gig_id, x.people), '{}'::jsonb) from (
    select s.gig_id, jsonb_agg(jsonb_build_object('username', p.username,
             'name', coalesce(nullif(p.display_name, ''), u.raw_user_meta_data->>'full_name', p.username),
             'avatar', case when p.avatar_status in ('ok', 'approved') then coalesce(p.avatar_url, u.raw_user_meta_data->>'avatar_url') end)) people
    from public.saved_gigs s join public.profiles p on p.id = s.user_id join auth.users u on u.id = s.user_id
    where s.user_id in (select public.my_followees()) and s.going
      and (s.gig->>'d') >= to_char(now() at time zone 'Australia/Sydney', 'YYYY-MM-DD')
    group by s.gig_id) x
$$;
revoke all on function public.friends_going() from public, anon;
grant execute on function public.friends_going() to authenticated;

-- Shared profiles also show the gig diary (ratings, notes, photos) on "Been to".
create or replace function public.gig_diary(pid uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.g order by x.g->>'d' desc), '[]'::jsonb) from (
    select s.gig || jsonb_build_object('id', s.gig_id, 'rating', s.rating, 'review', s.review,
      'photos', coalesce((select jsonb_agg(gp.url order by gp.created_at) from public.gig_photos gp where gp.user_id = s.user_id and gp.gig_id = s.gig_id and gp.status in ('ok', 'approved')), '[]'::jsonb)) g
    from public.saved_gigs s where s.user_id = pid and s.going
      and (s.gig->>'d') < to_char(now() at time zone 'Australia/Sydney', 'YYYY-MM-DD')
    order by s.gig->>'d' desc limit 60) x
$$;
revoke all on function public.gig_diary(uuid) from public, anon, authenticated;

-- Messages (added 27 Nov 2026). Private messages between friends: you can only message someone when you both
-- follow each other. Everything goes through the functions below, which check that, plus blocks, bans and limits.
-- People can read their own messages directly too (needed for the live "new message" signal), but never write them.
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  sender uuid not null references auth.users(id) on delete cascade,
  recipient uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  notified boolean not null default false,          -- "you've got a message" email sent (or not needed)
  hidden_for_sender boolean not null default false,   -- "Delete conversation" only hides it for you
  hidden_for_recipient boolean not null default false,
  check (sender <> recipient),
  check (char_length(body) between 1 and 1000));
create index if not exists messages_pair on public.messages (sender, recipient, id desc);
create index if not exists messages_unread on public.messages (recipient) where read_at is null;
create index if not exists messages_sender_time on public.messages (sender, created_at desc);
alter table public.messages enable row level security;
drop policy if exists "see own messages" on public.messages;
create policy "see own messages" on public.messages for select to authenticated using ((select auth.uid()) in (sender, recipient));
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant all on public.messages to service_role;
-- Live updates: Supabase Realtime tells the browser straight away when a new message arrives.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- Blocking: you can block anyone. They can't message you or follow you, existing follows both ways are removed,
-- and they're not told. Message bans are set by Mick from a report email (server only).
create table if not exists public.user_blocks (
  blocker uuid not null references auth.users(id) on delete cascade,
  blocked uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked));
alter table public.user_blocks enable row level security;
drop policy if exists "see own blocks" on public.user_blocks;
create policy "see own blocks" on public.user_blocks for select to authenticated using ((select auth.uid()) = blocker);
revoke all on public.user_blocks from anon, authenticated;
grant select on public.user_blocks to authenticated;
create table if not exists public.message_bans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now());
create table if not exists public.message_reports (
  id bigint generated always as identity primary key,
  reporter uuid references auth.users(id) on delete set null,
  reported uuid references auth.users(id) on delete cascade,
  message_id bigint, body text, reason text,
  created_at timestamptz not null default now());
alter table public.message_bans enable row level security;
alter table public.message_reports enable row level security;
grant all on public.user_blocks, public.message_bans, public.message_reports to service_role;
alter table public.profiles add column if not exists remind_messages boolean not null default true;  -- "you've got a message" emails
alter table public.profiles add column if not exists last_message_email timestamptz;

create or replace function public.is_blocked(a uuid, b uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a))
$$;
revoke all on function public.is_blocked(uuid, uuid) from public, anon, authenticated;

-- Can I message this person? Returns 'ok', or why not: 'not_friends', 'blocked_by_you', 'blocked', 'banned'.
create or replace function public.message_status(me uuid, t uuid) returns text language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from public.message_bans where user_id = me) then 'banned'
    when exists (select 1 from public.user_blocks where blocker = me and blocked = t) then 'blocked_by_you'
    when exists (select 1 from public.user_blocks where blocker = t and blocked = me) then 'blocked'
    when exists (select 1 from public.follows where follower = me and followee = t)
     and exists (select 1 from public.follows where follower = t and followee = me) then 'ok'
    else 'not_friends' end
$$;
revoke all on function public.message_status(uuid, uuid) from public, anon, authenticated;

-- Send a message. Limits keep spam out: 60 messages an hour, 20 a day for accounts less than a day old,
-- and no more than 5 in a row to someone until they reply.
create or replace function public.send_message(uname text, body text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); t uuid; st text; b text := btrim(coalesce(body, '')); m public.messages; streak int;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select id into t from public.profiles where lower(username) = lower(uname);
  if t is null or t = me then return jsonb_build_object('error', 'not_found'); end if;
  if b = '' then return jsonb_build_object('error', 'empty'); end if;
  if char_length(b) > 1000 then return jsonb_build_object('error', 'too_long'); end if;
  st := public.message_status(me, t);
  if st <> 'ok' then return jsonb_build_object('error', st); end if;
  if (select count(*) from public.messages where sender = me and created_at > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('error', 'slow_down'); end if;
  if (select created_at from auth.users where id = me) > now() - interval '1 day'
     and (select count(*) from public.messages where sender = me and created_at > now() - interval '1 day') >= 20 then
    return jsonb_build_object('error', 'new_account'); end if;
  select count(*) into streak from public.messages x where x.sender = me and x.recipient = t
    and x.id > coalesce((select max(y.id) from public.messages y where y.sender = t and y.recipient = me), 0);
  if streak >= 5 and not exists (select 1 from public.messages y where y.sender = t and y.recipient = me) then
    return jsonb_build_object('error', 'wait_reply'); end if;
  insert into public.messages (sender, recipient, body) values (me, t, b) returning * into m;
  return jsonb_build_object('id', m.id, 'body', m.body, 'at', m.created_at, 'mine', true);
end $$;

-- Your conversations, newest first, with the last message and how many are unread.
create or replace function public.my_conversations() returns jsonb language sql stable security definer set search_path = '' as $$
  with mine as (
    select m.*, case when m.sender = auth.uid() then m.recipient else m.sender end other
    from public.messages m
    where (m.sender = auth.uid() and not m.hidden_for_sender) or (m.recipient = auth.uid() and not m.hidden_for_recipient)),
  last as (select distinct on (other) other, id, body, created_at, sender = auth.uid() mine from mine order by other, id desc),
  unread as (select other, count(*) n from mine where recipient = auth.uid() and read_at is null group by other)
  select coalesce(jsonb_agg(public.person_card(l.other) - 'going' - 'records' - 'banner' || jsonb_build_object(
      'last', l.body, 'at', l.created_at, 'mine', l.mine, 'unread', coalesce(u.n, 0),
      'can', public.message_status(auth.uid(), l.other)) order by l.id desc), '[]'::jsonb)
  from last l left join unread u on u.other = l.other
  where not exists (select 1 from public.user_blocks b where b.blocker = auth.uid() and b.blocked = l.other)
$$;

-- One conversation (50 messages at a time, older ones with before_id). Opening it marks their messages as read.
create or replace function public.conversation(uname text, before_id bigint default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); t uuid; msgs jsonb;
begin
  if me is null then raise exception 'Sign in first'; end if;
  select id into t from public.profiles where lower(username) = lower(uname);
  if t is null or t = me then return null; end if;
  if before_id is null then
    update public.messages set read_at = now() where sender = t and recipient = me and read_at is null;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'body', x.body, 'at', x.created_at, 'mine', x.sender = me,
           'read', x.read_at is not null) order by x.id), '[]'::jsonb) into msgs
  from (select * from public.messages m
        where ((m.sender = me and m.recipient = t and not m.hidden_for_sender) or (m.sender = t and m.recipient = me and not m.hidden_for_recipient))
          and (before_id is null or m.id < before_id)
          and not exists (select 1 from public.user_blocks b where b.blocker = me and b.blocked = t and m.sender = t and m.created_at > b.created_at)
        order by m.id desc limit 50) x;
  return public.person_card(t) - 'going' - 'records' || jsonb_build_object('messages', msgs, 'can', public.message_status(me, t),
    'more', jsonb_array_length(msgs) = 50,
    'i_follow', exists (select 1 from public.follows where follower = me and followee = t),
    'follows_me', exists (select 1 from public.follows where follower = t and followee = me));
end $$;

-- The red number on the Messages button.
create or replace function public.unread_messages() returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.messages m where m.recipient = auth.uid() and m.read_at is null and not m.hidden_for_recipient
    and not exists (select 1 from public.user_blocks b where b.blocker = auth.uid() and b.blocked = m.sender)
$$;

-- "Delete conversation": hides it for you only. If either of you writes again, a fresh conversation starts.
create or replace function public.delete_conversation(uname text) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); t uuid;
begin
  select id into t from public.profiles where lower(username) = lower(uname);
  if me is null or t is null then return; end if;
  update public.messages set hidden_for_sender = true where sender = me and recipient = t;
  update public.messages set hidden_for_recipient = true, read_at = coalesce(read_at, now()) where sender = t and recipient = me;
end $$;

create or replace function public.block_user(uname text) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); t uuid;
begin
  select id into t from public.profiles where lower(username) = lower(uname);
  if me is null or t is null or t = me then return; end if;
  insert into public.user_blocks (blocker, blocked) values (me, t) on conflict do nothing;
  delete from public.follows where (follower = me and followee = t) or (follower = t and followee = me);
  update public.messages set read_at = coalesce(read_at, now()), notified = true where sender = t and recipient = me;
end $$;
create or replace function public.unblock_user(uname text) returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); t uuid;
begin
  select id into t from public.profiles where lower(username) = lower(uname);
  delete from public.user_blocks where blocker = me and blocked = t;
end $$;
create or replace function public.my_blocks() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('username', p.username) order by b.created_at desc), '[]'::jsonb)
  from public.user_blocks b join public.profiles p on p.id = b.blocked where b.blocker = auth.uid()
$$;

-- Following now also checks blocks (same as before otherwise).
create or replace function public.follow_user(uname text) returns boolean language plpgsql security definer set search_path = '' as $$
declare t uuid; me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first'; end if;
  select id into t from public.profiles where lower(username) = lower(uname) and share;
  if t is null or t = me or public.is_blocked(me, t) then return false; end if;
  if (select count(*) from public.follows where follower = me) >= 2000 then raise exception 'Following too many people'; end if;
  insert into public.follows (follower, followee) values (me, t) on conflict do nothing;
  return true;
end $$;

revoke all on function public.send_message(text, text) from public, anon;
revoke all on function public.my_conversations() from public, anon;
revoke all on function public.conversation(text, bigint) from public, anon;
revoke all on function public.unread_messages() from public, anon;
revoke all on function public.delete_conversation(text) from public, anon;
revoke all on function public.block_user(text) from public, anon;
revoke all on function public.unblock_user(text) from public, anon;
revoke all on function public.my_blocks() from public, anon;
revoke all on function public.follow_user(text) from public, anon;
grant execute on function public.send_message(text, text), public.my_conversations(), public.conversation(text, bigint), public.unread_messages(),
  public.delete_conversation(text), public.block_user(text), public.unblock_user(text), public.my_blocks(), public.follow_user(text) to authenticated;

-- ============================================================================================
-- Posts, likes and replies, a short bio, and profile activity (added 28 Nov 2026).
-- People can post a short update ("Can't wait for the gig tonight"), optionally tagged with a gig or an artist.
-- Who sees a post: the person who wrote it, and (if their profile is shared) anyone who can see their profile;
-- people who follow them get it in their friends feed. Blocks work both ways. Everything goes through the
-- functions below, which check sign-in, bans, limits and a small blocked-words list.
-- Reporting a post or reply hides it straight away until Mick reviews it (netlify/functions/report-post.mjs).
alter table public.profiles add column if not exists bio text;
alter table public.profiles drop constraint if exists bio_ok;
alter table public.profiles add constraint bio_ok check (bio is null or char_length(bio) <= 120);

create table if not exists public.posts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  gig jsonb,                       -- snapshot of a tagged gig: id, d, tm, a, s, v, c, u, p
  artist jsonb,                    -- a tagged artist: slug, name
  status text not null default 'ok' check (status in ('ok', 'approved', 'hidden', 'removed')),
  created_at timestamptz not null default now());
create index if not exists posts_user_time on public.posts (user_id, created_at desc);
create table if not exists public.post_likes (
  post_id bigint not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id));
create table if not exists public.post_replies (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 280),
  status text not null default 'ok' check (status in ('ok', 'approved', 'hidden', 'removed')),
  created_at timestamptz not null default now());
create index if not exists post_replies_post on public.post_replies (post_id, id);
create index if not exists post_replies_user_time on public.post_replies (user_id, created_at desc);
create table if not exists public.post_reports (
  id bigint generated always as identity primary key,
  reporter uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('post', 'reply')),
  target bigint not null,
  owner uuid references auth.users(id) on delete cascade,
  body text, reason text,
  created_at timestamptz not null default now());
create table if not exists public.post_bans (user_id uuid primary key references auth.users(id) on delete cascade, created_at timestamptz not null default now());
-- Words that stop a post or reply going up (whole words, any case). Add more rows in Supabase any time.
create table if not exists public.blocked_words (word text primary key);
-- Server-only tables: row level security on and no policies, so browsers can only use them through the functions.
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_replies enable row level security;
alter table public.post_reports enable row level security;
alter table public.post_bans enable row level security;
alter table public.blocked_words enable row level security;
revoke all on public.posts, public.post_likes, public.post_replies, public.post_reports, public.post_bans, public.blocked_words from anon, authenticated;
grant all on public.posts, public.post_likes, public.post_replies, public.post_reports, public.post_bans, public.blocked_words to service_role;

create or replace function public.has_blocked_word(t text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.blocked_words w where lower(t) ~ ('(^|[^a-z])' || w.word || '($|[^a-z])'))
$$;
revoke all on function public.has_blocked_word(text) from public, anon, authenticated;

-- Can this viewer see this person's posts?
create or replace function public.can_see_posts(viewer uuid, owner uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select viewer is not distinct from owner or (exists (select 1 from public.profiles p where p.id = owner and p.share and p.username is not null)
    and (viewer is null or not public.is_blocked(viewer, owner)))
$$;
revoke all on function public.can_see_posts(uuid, uuid) from public, anon, authenticated;

create or replace function public.who_card(pid uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('username', p.username,
    'name', coalesce(nullif(p.display_name, ''), u.raw_user_meta_data->>'full_name', p.username),
    'avatar', case when p.avatar_status in ('ok', 'approved') then coalesce(p.avatar_url, u.raw_user_meta_data->>'avatar_url') end)
  from public.profiles p join auth.users u on u.id = p.id where p.id = pid
$$;
revoke all on function public.who_card(uuid) from public, anon, authenticated;

-- One post as the browser sees it.
create or replace function public.post_json(pid bigint) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', x.id, 'body', x.body, 'gig', x.gig, 'artist', x.artist, 'at', x.created_at,
    'mine', x.user_id = auth.uid(), 'hidden', x.status = 'hidden',
    'likes', (select count(*) from public.post_likes l where l.post_id = x.id),
    'liked', exists (select 1 from public.post_likes l where l.post_id = x.id and l.user_id = auth.uid()),
    'replies', (select count(*) from public.post_replies r where r.post_id = x.id and (r.status in ('ok', 'approved') or r.user_id = auth.uid())))
  from public.posts x where x.id = pid
$$;
revoke all on function public.post_json(bigint) from public, anon, authenticated;

-- A post the viewer is allowed to see (null if not).
create or replace function public.visible_post(pid bigint) returns public.posts language sql stable security definer set search_path = '' as $$
  select x.* from public.posts x where x.id = pid and public.can_see_posts(auth.uid(), x.user_id)
    and (x.status in ('ok', 'approved') or (x.status = 'hidden' and x.user_id = auth.uid()))
$$;
revoke all on function public.visible_post(bigint) from public, anon, authenticated;

create or replace function public.create_post(body text, gig jsonb default null, artist jsonb default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); b text := btrim(coalesce(body, '')); g jsonb; a jsonb; nid bigint;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if exists (select 1 from public.post_bans where user_id = me) then raise exception 'Posting is switched off for your account'; end if;
  if char_length(b) < 1 or char_length(b) > 500 then raise exception 'Posts can be up to 500 characters'; end if;
  if public.has_blocked_word(b) then raise exception 'Your post has a word we don''t allow. Please change it and try again.'; end if;
  if (select count(*) from public.posts where user_id = me and created_at > now() - interval '1 hour') >= 10 then raise exception 'That''s a lot of posts. Try again in a little while.'; end if;
  if gig is not null and gig ? 'id' then
    g := jsonb_strip_nulls(jsonb_build_object('id', left(gig->>'id', 120), 'd', left(gig->>'d', 10), 'tm', left(gig->>'tm', 10), 'a', left(gig->>'a', 120),
      's', left(gig->>'s', 120), 'v', left(gig->>'v', 120), 'c', left(gig->>'c', 60), 'u', left(gig->>'u', 400), 'p', left(gig->>'p', 200)));
  end if;
  if artist is not null and artist ? 'slug' then a := jsonb_build_object('slug', left(artist->>'slug', 120), 'name', left(artist->>'name', 120)); end if;
  insert into public.posts (user_id, body, gig, artist) values (me, b, g, a) returning id into nid;
  return public.post_json(nid);
end $$;

create or replace function public.delete_post(pid bigint) returns void language sql security definer set search_path = '' as $$
  delete from public.posts where id = pid and user_id = auth.uid()
$$;

create or replace function public.like_post(pid bigint, on_ boolean default true) returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first'; end if;
  if (public.visible_post(pid)).id is null then return null; end if;
  if on_ then insert into public.post_likes (post_id, user_id) values (pid, me) on conflict do nothing;
  else delete from public.post_likes where post_id = pid and user_id = me; end if;
  return public.post_json(pid);
end $$;

create or replace function public.reply_json(rid bigint) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', r.id, 'body', r.body, 'at', r.created_at, 'who', public.who_card(r.user_id),
    'mine', r.user_id = auth.uid(), 'hidden', r.status = 'hidden',
    'can_delete', r.user_id = auth.uid() or (select x.user_id from public.posts x where x.id = r.post_id) = auth.uid())
  from public.post_replies r where r.id = rid
$$;
revoke all on function public.reply_json(bigint) from public, anon, authenticated;

create or replace function public.reply_post(pid bigint, body text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); b text := btrim(coalesce(body, '')); p public.posts; nid bigint;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if exists (select 1 from public.post_bans where user_id = me) then raise exception 'Posting is switched off for your account'; end if;
  p := public.visible_post(pid);
  if p.id is null then raise exception 'That post isn''t available'; end if;
  if char_length(b) < 1 or char_length(b) > 280 then raise exception 'Replies can be up to 280 characters'; end if;
  if public.has_blocked_word(b) then raise exception 'Your reply has a word we don''t allow. Please change it and try again.'; end if;
  if (select count(*) from public.post_replies where user_id = me and created_at > now() - interval '1 hour') >= 30 then raise exception 'That''s a lot of replies. Try again in a little while.'; end if;
  insert into public.post_replies (post_id, user_id, body) values (pid, me, b) returning id into nid;
  return public.reply_json(nid);
end $$;

-- Replies on a post: anyone who can see the post sees its replies (except ones hidden after a report, or from people blocked either way).
create or replace function public.post_replies_list(pid bigint) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(public.reply_json(r.id) order by r.id), '[]'::jsonb) from public.post_replies r
  where r.post_id = pid and (public.visible_post(pid)).id is not null
    and (r.status in ('ok', 'approved') or (r.status = 'hidden' and r.user_id = auth.uid()))
    and (auth.uid() is null or not public.is_blocked(auth.uid(), r.user_id))
$$;

-- Delete your own reply, or any reply on your own post.
create or replace function public.delete_reply(rid bigint) returns void language sql security definer set search_path = '' as $$
  delete from public.post_replies r where r.id = rid
    and (r.user_id = auth.uid() or exists (select 1 from public.posts x where x.id = r.post_id and x.user_id = auth.uid()))
$$;

-- Bio line on your profile.
create or replace function public.set_bio(bio text) returns void language plpgsql security definer set search_path = '' as $$
declare b text := nullif(btrim(coalesce(bio, '')), '');
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if char_length(b) > 120 then raise exception 'Keep it to 120 characters'; end if;
  if public.has_blocked_word(coalesce(b, '')) then raise exception 'That has a word we don''t allow.'; end if;
  update public.profiles set bio = b, updated_at = now() where id = auth.uid();
end $$;

-- Everything one person has been up to, newest first: posts, going, ratings, records and photos.
-- Their own page shows it all; other people see it only if the profile is shared (and not blocked).
create or replace function public.profile_activity(uname text, before timestamptz default null) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare pid uuid; me uuid := auth.uid(); cut timestamptz := coalesce(before, now() + interval '1 minute'); who jsonb;
begin
  select id into pid from public.profiles where lower(username) = lower(uname);
  if pid is null and me is not null and (uname is null or uname = '') then pid := me; end if;
  if pid is null or not public.can_see_posts(me, pid) then return '[]'::jsonb; end if;
  who := public.who_card(pid);
  return coalesce((select jsonb_agg(jsonb_build_object('who', who, 't', e.t, 'at', e.at, 'gig', e.gig, 'rec', e.rec, 'rating', e.rating, 'review', e.review, 'photo', e.photo, 'post', e.post) order by e.at desc)
  from (select * from (
    select 'post' t, x.created_at at, null::jsonb gig, null::jsonb rec, null::smallint rating, null::text review, null::text photo, public.post_json(x.id) post
      from public.posts x where x.user_id = pid and x.created_at < cut and (x.status in ('ok', 'approved') or (x.status = 'hidden' and pid = me))
    union all
    select 'going', s.going_at, s.gig || jsonb_build_object('id', s.gig_id), null, null, null, null, null
      from public.saved_gigs s where s.user_id = pid and s.going and s.going_at is not null and s.going_at < cut
    union all
    select 'review', s.reviewed_at, s.gig || jsonb_build_object('id', s.gig_id), null, s.rating, s.review, null, null
      from public.saved_gigs s where s.user_id = pid and s.rating is not null and s.reviewed_at < cut
    union all
    select 'record', r.created_at, null, r.rec || jsonb_build_object('rid', r.rid), null, null, null, null
      from public.user_records r where r.user_id = pid and r.list = 'collection' and r.created_at < cut
    union all
    select 'photo', g.created_at, (select s.gig || jsonb_build_object('id', s.gig_id) from public.saved_gigs s where s.user_id = g.user_id and s.gig_id = g.gig_id), null, null, null, g.url, null
      from public.gig_photos g where g.user_id = pid and g.created_at < cut and (g.status in ('ok', 'approved') or pid = me)
  ) u order by at desc limit 300) e), '[]'::jsonb);
end $$;

-- The friends feed now includes posts (from the people you follow, and your own).
create or replace function public.friends_feed() returns jsonb language sql stable security definer set search_path = '' as $$
  with f as (select public.my_followees() id),
  who as (select x.id, public.who_card(x.id) card from (select id from f union select auth.uid()) x),
  ev as (
    select x.user_id, 'post' t, x.created_at at, null::jsonb gig, null::jsonb rec, null::smallint rating, null::text review, null::text photo, public.post_json(x.id) post
      from public.posts x where x.created_at > now() - interval '60 days'
        and ((x.user_id in (select id from f) and x.status in ('ok', 'approved') and not public.is_blocked(auth.uid(), x.user_id))
          or (x.user_id = auth.uid() and x.status <> 'removed'))
    union all
    select s.user_id, 'going', s.going_at, s.gig || jsonb_build_object('id', s.gig_id), null, null, null, null, null
      from public.saved_gigs s where s.user_id in (select id from f) and s.going and s.going_at > now() - interval '60 days'
    union all
    select s.user_id, 'review', s.reviewed_at, s.gig || jsonb_build_object('id', s.gig_id), null, s.rating, s.review, null, null
      from public.saved_gigs s where s.user_id in (select id from f) and s.rating is not null and s.reviewed_at > now() - interval '60 days'
    union all
    select r.user_id, 'record', r.created_at, null, r.rec || jsonb_build_object('rid', r.rid), null, null, null, null
      from public.user_records r where r.user_id in (select id from f) and r.list = 'collection' and r.created_at > now() - interval '60 days'
    union all
    select g.user_id, 'photo', g.created_at, (select s.gig || jsonb_build_object('id', s.gig_id) from public.saved_gigs s where s.user_id = g.user_id and s.gig_id = g.gig_id), null, null, null, g.url, null
      from public.gig_photos g where g.user_id in (select id from f) and g.status in ('ok', 'approved') and g.created_at > now() - interval '60 days')
  select coalesce(jsonb_agg(jsonb_build_object('who', w.card, 't', e.t, 'at', e.at, 'gig', e.gig, 'rec', e.rec, 'rating', e.rating, 'review', e.review, 'photo', e.photo, 'post', e.post) order by e.at desc), '[]'::jsonb)
  from (select * from ev order by at desc limit 400) e join who w on w.id = e.user_id
$$;

-- Shared profiles now include the bio and a few counts for the stats line.
create or replace function public.profile_extras(pid uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('bio', p.bio, 'city', p.city,
    'n_seen', (select count(*) from public.saved_gigs s where s.user_id = pid and s.going and (s.gig->>'d') < to_char(now() at time zone 'Australia/Sydney', 'YYYY-MM-DD')),
    'n_artists', (select count(*) from public.followed_artists a where a.user_id = pid))
  from public.profiles p where p.id = pid
$$;
revoke all on function public.profile_extras(uuid) from public, anon, authenticated;
create or replace function public.public_profile_v2(uname text) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare r jsonb := public.public_profile(uname); pid uuid;
begin
  if r is null or (r ? 'private') then return r; end if;
  select id into pid from public.profiles where lower(username) = lower(uname);
  return r || public.profile_extras(pid);
end $$;

revoke all on function public.create_post(text, jsonb, jsonb), public.delete_post(bigint), public.like_post(bigint, boolean), public.reply_post(bigint, text),
  public.delete_reply(bigint), public.set_bio(text), public.friends_feed() from public, anon;
revoke all on function public.post_replies_list(bigint), public.profile_activity(text, timestamptz), public.public_profile_v2(text) from public;
grant execute on function public.create_post(text, jsonb, jsonb), public.delete_post(bigint), public.like_post(bigint, boolean), public.reply_post(bigint, text),
  public.delete_reply(bigint), public.set_bio(text), public.friends_feed() to authenticated;
grant execute on function public.post_replies_list(bigint), public.profile_activity(text, timestamptz), public.public_profile_v2(text) to anon, authenticated;

-- A starter list of hateful slurs that can't be posted (everyday swearing is fine at a gig site). Add more any time.
insert into public.blocked_words (word) values ('nigger'), ('nigga'), ('faggot'), ('fag'), ('coon'), ('chink'), ('gook'), ('spic'), ('kike'),
  ('wetback'), ('tranny'), ('retard'), ('abo'), ('boong'), ('sandnigger'), ('raghead'), ('towelhead'), ('paki') on conflict do nothing;

-- ============================================================================================
-- Vinyl round 2 (added 28 Nov 2026): "Now spinning" posts (a post can carry a record), play counts,
-- and an email setting for "something on your wantlist is in stock at Heathen Records".
alter table public.posts add column if not exists record jsonb;
alter table public.posts drop constraint if exists posts_body_check;
alter table public.posts drop constraint if exists posts_body_ok;
alter table public.posts add constraint posts_body_ok check (char_length(btrim(body)) <= 500 and (char_length(btrim(body)) >= 1 or record is not null));
alter table public.profiles add column if not exists remind_wants boolean not null default true;

create or replace function public.post_json(pid bigint) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', x.id, 'body', x.body, 'gig', x.gig, 'artist', x.artist, 'record', x.record, 'at', x.created_at,
    'mine', x.user_id = auth.uid(), 'hidden', x.status = 'hidden',
    'likes', (select count(*) from public.post_likes l where l.post_id = x.id),
    'liked', exists (select 1 from public.post_likes l where l.post_id = x.id and l.user_id = auth.uid()),
    'replies', (select count(*) from public.post_replies r where r.post_id = x.id and (r.status in ('ok', 'approved') or r.user_id = auth.uid())))
  from public.posts x where x.id = pid
$$;
revoke all on function public.post_json(bigint) from public, anon, authenticated;

drop function if exists public.create_post(text, jsonb, jsonb);
create or replace function public.create_post(body text, gig jsonb default null, artist jsonb default null, record jsonb default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); b text := btrim(coalesce(body, '')); g jsonb; a jsonb; r jsonb; nid bigint;
begin
  if me is null then raise exception 'Sign in first'; end if;
  if exists (select 1 from public.post_bans where user_id = me) then raise exception 'Posting is switched off for your account'; end if;
  if record is not null and record ? 'rid' then
    r := jsonb_strip_nulls(jsonb_build_object('rid', left(record->>'rid', 30), 'a', left(record->>'a', 120), 't', left(record->>'t', 160), 'y', left(record->>'y', 4),
      'img', left(record->>'img', 400), 'c', left(record->>'c', 40), 'l', left(record->>'l', 80), 'col', left(record->>'col', 80)));
  end if;
  if char_length(b) > 500 or (char_length(b) < 1 and r is null) then raise exception 'Posts can be up to 500 characters'; end if;
  if public.has_blocked_word(b) then raise exception 'Your post has a word we don''t allow. Please change it and try again.'; end if;
  if (select count(*) from public.posts where user_id = me and created_at > now() - interval '1 hour') >= 20 then raise exception 'That''s a lot of posts. Try again in a little while.'; end if;
  if gig is not null and gig ? 'id' then
    g := jsonb_strip_nulls(jsonb_build_object('id', left(gig->>'id', 120), 'd', left(gig->>'d', 10), 'tm', left(gig->>'tm', 10), 'a', left(gig->>'a', 120),
      's', left(gig->>'s', 120), 'v', left(gig->>'v', 120), 'c', left(gig->>'c', 60), 'u', left(gig->>'u', 400), 'p', left(gig->>'p', 200)));
  end if;
  if artist is not null and artist ? 'slug' then a := jsonb_build_object('slug', left(artist->>'slug', 120), 'name', left(artist->>'name', 120)); end if;
  insert into public.posts (user_id, body, gig, artist, record) values (me, b, g, a, r) returning id into nid;
  return public.post_json(nid);
end $$;
revoke all on function public.create_post(text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_post(text, jsonb, jsonb, jsonb) to authenticated;

-- How many times you've spun each record ("Now spinning" posts), and when you last did.
create or replace function public.my_plays() returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(x.rid, jsonb_build_array(x.n, x.last)), '{}'::jsonb) from (
    select p.record->>'rid' rid, count(*) n, max(p.created_at) last from public.posts p
    where p.user_id = auth.uid() and p.record is not null and p.status <> 'removed' group by 1) x
$$;
revoke all on function public.my_plays() from public, anon;
grant execute on function public.my_plays() to authenticated;
