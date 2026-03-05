create table events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  event_data jsonb default '{}',
  created_at timestamptz default now()
);

alter table events enable row level security;

create policy "Users can insert own events" on events
  for insert with check (auth.uid() = user_id);
