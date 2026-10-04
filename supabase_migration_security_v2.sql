-- Chạy thủ công một lần trong Supabase SQL Editor. Không chứa dữ liệu bí mật.
alter table public.warehouse_items add column if not exists status text not null default 'active';
alter table public.warehouse_items add column if not exists sold_at timestamptz;
alter table public.warehouse_items add column if not exists sold_note text;
alter table public.zalo_messages add column if not exists read boolean not null default false;

alter table public.warehouse_items drop constraint if exists warehouse_items_warehouse_check;
alter table public.warehouse_items add constraint warehouse_items_warehouse_check check (warehouse between 1 and 100);
alter table public.warehouse_items drop constraint if exists warehouse_items_status_check;
alter table public.warehouse_items add constraint warehouse_items_status_check check (status in ('active', 'sold'));

alter table public.zalo_messages drop constraint if exists zalo_messages_warehouse_check;
alter table public.zalo_messages add constraint zalo_messages_warehouse_check check (warehouse between 1 and 100);

alter table public.warehouse_history drop constraint if exists warehouse_history_action_check;
alter table public.warehouse_history add constraint warehouse_history_action_check check (action in ('in', 'out', 'transfer', 'sold', 'restock'));
alter table public.warehouse_history drop constraint if exists warehouse_history_from_warehouse_check;
alter table public.warehouse_history add constraint warehouse_history_from_warehouse_check check (from_warehouse between 1 and 100);
alter table public.warehouse_history drop constraint if exists warehouse_history_to_warehouse_check;
alter table public.warehouse_history add constraint warehouse_history_to_warehouse_check check (to_warehouse between 1 and 100);

create table if not exists public.warehouse_settings (
  id text primary key,
  total_warehouses integer not null default 30 check (total_warehouses between 1 and 100)
);
insert into public.warehouse_settings (id, total_warehouses) values ('default', 30)
on conflict (id) do nothing;

alter table public.warehouse_items enable row level security;
alter table public.zalo_messages enable row level security;
alter table public.warehouse_history enable row level security;
alter table public.warehouse_settings enable row level security;

drop policy if exists "public read warehouse_items" on public.warehouse_items;
drop policy if exists "public write warehouse_items" on public.warehouse_items;
drop policy if exists "public read zalo_messages" on public.zalo_messages;
drop policy if exists "public write zalo_messages" on public.zalo_messages;
drop policy if exists "public read warehouse_history" on public.warehouse_history;
drop policy if exists "public write warehouse_history" on public.warehouse_history;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime drop table public.warehouse_items; exception when undefined_object then null; end;
    begin alter publication supabase_realtime drop table public.zalo_messages; exception when undefined_object then null; end;
    begin alter publication supabase_realtime drop table public.warehouse_history; exception when undefined_object then null; end;
  end if;
end $$;
