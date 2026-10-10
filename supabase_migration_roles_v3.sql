-- Chạy thủ công một lần trong Supabase SQL Editor. Chứa cột lưu PIN nhân viên + bộ đếm khóa đăng nhập.
alter table public.warehouse_settings add column if not exists staff_pin_hash text;
alter table public.warehouse_settings add column if not exists pin_fail_count integer not null default 0;
alter table public.warehouse_settings add column if not exists pin_locked_until timestamptz;
