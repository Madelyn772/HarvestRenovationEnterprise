-- Core Supabase bootstrap for the Harvest Renovation Enterprise portal.
-- This file covers auth/profile and portal settings dependencies used by app.js.

create table if not exists public.profiles (
  id uuid primary key,
  email text not null unique,
  full_name text,
  phone text,
  role text not null default 'staff',
  status text not null default 'pending',
  google_calendar_embed_url text,
  calendar_label text,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.portal_settings (
  id integer primary key,
  company_calendar_name text not null default 'Harvest Renovation Company Calendar',
  company_calendar_embed_url text,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles add column if not exists phone text;

alter table public.profiles enable row level security;
alter table public.portal_settings enable row level security;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and status = 'active'
      and role = 'admin'
  );
$$;

create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    status
  )
  values (
    new.id,
    lower(new.email),
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    case
      when lower(new.email) = 'contactmpuentes@gmail.com' then 'admin'
      else 'staff'
    end,
    case
      when lower(new.email) in ('contactmpuentes@gmail.com', 'jpuentes1992@gmail.com') then 'active'
      else 'pending'
    end
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(excluded.full_name, public.profiles.full_name),
      updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user_profile();

drop policy if exists profiles_select_self_or_active_team on public.profiles;
create policy profiles_select_self_or_active_team
on public.profiles
for select
to authenticated
using ((auth.uid() = id) or (public.is_active_user() and status = 'active'));

drop policy if exists portal_settings_read_active_users on public.portal_settings;
create policy portal_settings_read_active_users
on public.portal_settings
for select
to authenticated
using (public.is_active_user());

create or replace function public.list_pending_profiles()
returns table(
  id uuid,
  email text,
  full_name text,
  role text,
  status text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.email, p.full_name, p.role, p.status, p.created_at
  from public.profiles p
  where p.status = 'pending'
    and public.is_admin_user()
  order by p.created_at asc;
$$;

create or replace function public.review_user_request(
  p_user_id uuid,
  p_decision text,
  p_role text default 'staff'
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  reviewed public.profiles;
  new_status text;
begin
  if not public.is_admin_user() then
    raise exception 'Only admins can review user requests';
  end if;

  if p_decision not in ('approve', 'deny') then
    raise exception 'Decision must be approve or deny';
  end if;

  new_status := case when p_decision = 'approve' then 'active' else 'denied' end;

  update public.profiles
  set status = new_status,
      role = case when p_decision = 'approve' then coalesce(nullif(trim(p_role), ''), 'staff') else role end,
      approved_by = auth.uid(),
      approved_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = p_user_id
  returning * into reviewed;

  if reviewed.id is null then
    raise exception 'User profile not found';
  end if;

  return reviewed;
end;
$$;

create or replace function public.update_my_profile(
  p_full_name text,
  p_google_calendar_embed_url text,
  p_calendar_label text,
  p_phone text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_profile public.profiles;
begin
  update public.profiles
  set full_name = nullif(trim(p_full_name), ''),
      google_calendar_embed_url = nullif(trim(p_google_calendar_embed_url), ''),
      calendar_label = nullif(trim(p_calendar_label), ''),
      phone = nullif(trim(p_phone), ''),
      updated_at = timezone('utc', now())
  where id = auth.uid()
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'Profile not found for current user';
  end if;

  return updated_profile;
end;
$$;

create or replace function public.set_user_phone(
  p_user_id uuid,
  p_phone text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_profile public.profiles;
begin
  if not public.is_admin_user() then
    raise exception 'Only admins can update user phone numbers';
  end if;

  update public.profiles
  set phone = nullif(trim(p_phone), ''),
      updated_at = timezone('utc', now())
  where id = p_user_id
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'User profile not found';
  end if;

  return updated_profile;
end;
$$;

create or replace function public.update_company_calendar_settings(
  p_company_calendar_name text,
  p_company_calendar_embed_url text
)
returns public.portal_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row public.portal_settings;
begin
  if not public.is_admin_user() then
    raise exception 'Only admins can update company calendar settings';
  end if;

  insert into public.portal_settings (id, company_calendar_name, company_calendar_embed_url)
  values (
    1,
    coalesce(nullif(trim(p_company_calendar_name), ''), 'Harvest Renovation Company Calendar'),
    nullif(trim(p_company_calendar_embed_url), '')
  )
  on conflict (id) do update
    set company_calendar_name = excluded.company_calendar_name,
        company_calendar_embed_url = excluded.company_calendar_embed_url,
        updated_at = timezone('utc', now())
  returning * into updated_row;

  return updated_row;
end;
$$;

create or replace function public.set_user_role(
  p_user_id uuid,
  p_role text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_profile public.profiles;
  normalized_role text;
begin
  if not public.is_admin_user() then
    raise exception 'Only admins can change user roles';
  end if;

  normalized_role := case when lower(trim(coalesce(p_role, ''))) = 'admin' then 'admin' else 'staff' end;

  update public.profiles
  set role = normalized_role,
      updated_at = timezone('utc', now())
  where id = p_user_id
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'User profile not found';
  end if;

  return updated_profile;
end;
$$;

create or replace function public.set_user_status(
  p_user_id uuid,
  p_status text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_profile public.profiles;
  normalized_status text;
begin
  if not public.is_admin_user() then
    raise exception 'Only admins can change user status';
  end if;

  normalized_status := lower(trim(coalesce(p_status, '')));
  if normalized_status not in ('active', 'inactive', 'pending', 'denied') then
    raise exception 'Status must be active, inactive, pending, or denied';
  end if;

  if p_user_id = auth.uid() and normalized_status <> 'active' then
    raise exception 'Admins cannot deactivate their own account';
  end if;

  update public.profiles
  set status = normalized_status,
      approved_by = case when normalized_status = 'active' then auth.uid() else approved_by end,
      approved_at = case when normalized_status = 'active' then timezone('utc', now()) else approved_at end,
      updated_at = timezone('utc', now())
  where id = p_user_id
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'User profile not found';
  end if;

  return updated_profile;
end;
$$;

insert into public.portal_settings (id, company_calendar_name, company_calendar_embed_url)
values (1, 'Harvest Renovation Company Calendar', null)
on conflict (id) do nothing;

insert into public.profiles (id, email, full_name, role, status)
select
  u.id,
  lower(u.email),
  nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', '')), ''),
  case
    when lower(u.email) = 'contactmpuentes@gmail.com' then 'admin'
    else 'staff'
  end,
  case
    when lower(u.email) in ('contactmpuentes@gmail.com', 'jpuentes1992@gmail.com') then 'active'
    else 'pending'
  end
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

update public.profiles
set role = case
      when lower(email) = 'contactmpuentes@gmail.com' then 'admin'
      when lower(email) = 'jpuentes1992@gmail.com' then 'staff'
      else role
    end,
    status = case
      when lower(email) in ('contactmpuentes@gmail.com', 'jpuentes1992@gmail.com') then 'active'
      else status
    end,
    updated_at = timezone('utc', now())
where lower(email) in ('contactmpuentes@gmail.com', 'jpuentes1992@gmail.com');

grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_admin_user() to authenticated;
grant execute on function public.list_pending_profiles() to authenticated;
grant execute on function public.review_user_request(uuid, text, text) to authenticated;
grant execute on function public.update_my_profile(text, text, text, text) to authenticated;
grant execute on function public.set_user_phone(uuid, text) to authenticated;
grant execute on function public.update_company_calendar_settings(text, text) to authenticated;