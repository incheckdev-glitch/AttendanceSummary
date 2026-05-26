create table if not exists public.ai_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  title text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.ai_chat_sessions(id) on delete cascade,
  user_id text,
  role text check (role in ('user', 'assistant', 'system')),
  content text,
  created_at timestamptz default now()
);
