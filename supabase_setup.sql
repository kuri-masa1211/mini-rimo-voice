-- Supabase SQL Setup Script for Mini Rimo Voice
-- ※ 何度実行してもエラーにならないように IF EXISTS / IF NOT EXISTS を使用しています。

-- 1. Create profiles table
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  role text default 'user',
  is_allowed boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create usage_logs table
create table if not exists public.usage_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  user_email text,
  action text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Enable RLS (Row Level Security)
alter table public.profiles enable row level security;
alter table public.usage_logs enable row level security;

-- ============================================================
-- 4. Admin判定用の関数（SECURITY DEFINER で RLS を迂回し、無限再帰を防止）
-- ============================================================
create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
end;
$$ language plpgsql security definer;

-- 5. Create Policies for profiles (drop first to allow re-run)
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles" on public.profiles
  for select using (public.is_admin());

drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Admins can update profiles" on public.profiles
  for update using (public.is_admin());

-- 6. Create Policies for usage_logs (drop first to allow re-run)
drop policy if exists "Users can insert own logs" on public.usage_logs;
create policy "Users can insert own logs" on public.usage_logs
  for insert with check (auth.uid() = user_id);

drop policy if exists "Admins can read all logs" on public.usage_logs;
create policy "Admins can read all logs" on public.usage_logs
  for select using (public.is_admin());

-- 7. Trigger to automatically create a profile when a new user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, is_allowed, role)
  values (new.id, new.email, false, 'user');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 8. 管理者権限の付与
-- ============================================================
UPDATE public.profiles
SET role = 'admin', is_allowed = true
WHERE email = 'kurikurisoso147@gmail.com';
