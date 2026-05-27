create extension if not exists pgcrypto;

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  tenant_id uuid references public.empresas(id) on delete set null,
  source_type text,
  source_id uuid,
  recipient_name text,
  phone text not null,
  normalized_phone text not null,
  message text not null,
  provider text not null default 'whatsapp-webjs',
  status text not null default 'queued' check (status in ('queued','sending','sent','delivered','read','failed','cancelled')),
  external_message_id text,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_messages_status on public.whatsapp_messages(status);
create index if not exists idx_whatsapp_messages_normalized_phone on public.whatsapp_messages(normalized_phone);
create index if not exists idx_whatsapp_messages_created_at on public.whatsapp_messages(created_at desc);
create index if not exists idx_whatsapp_messages_source on public.whatsapp_messages(source_type, source_id);
create index if not exists idx_whatsapp_messages_tenant_id on public.whatsapp_messages(tenant_id);

create table if not exists public.whatsapp_message_events (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.whatsapp_messages(id) on delete cascade,
  event_type text not null check (event_type in ('queued','sending','sent','delivered','read','failed','retry_scheduled','cancelled','callback_received')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_whatsapp_message_events_message_id on public.whatsapp_message_events(message_id);
create index if not exists idx_whatsapp_message_events_event_type on public.whatsapp_message_events(event_type);

create or replace function public.set_whatsapp_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_whatsapp_messages_updated_at on public.whatsapp_messages;
create trigger trg_whatsapp_messages_updated_at
before update on public.whatsapp_messages
for each row execute function public.set_whatsapp_updated_at();

alter table public.whatsapp_messages enable row level security;
alter table public.whatsapp_message_events enable row level security;

create policy "Users can view own tenant/user whatsapp messages"
on public.whatsapp_messages
for select
to authenticated
using (
  (user_id = auth.uid())
  or exists (
    select 1 from public.empresas e
    where e.id = tenant_id and e.user_id = auth.uid()
  )
);

create policy "Service role manages whatsapp messages"
on public.whatsapp_messages
for all
to service_role
using (true)
with check (true);

create policy "Users can view events from own messages"
on public.whatsapp_message_events
for select
to authenticated
using (
  exists (
    select 1 from public.whatsapp_messages wm
    where wm.id = message_id and (
      wm.user_id = auth.uid()
      or exists (select 1 from public.empresas e where e.id = wm.tenant_id and e.user_id = auth.uid())
    )
  )
);

create policy "Service role manages whatsapp events"
on public.whatsapp_message_events
for all
to service_role
using (true)
with check (true);
