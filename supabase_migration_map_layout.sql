-- ============================================================
-- CẬP NHẬT DATABASE: Thêm cột lưu bố cục bản đồ kho (map_layout)
-- Bảng: warehouse_settings
-- Chạy đoạn SQL này trong Supabase Dashboard -> SQL Editor
-- ============================================================

-- 1. Bổ sung cột map_layout kiểu JSONB (nếu chưa có)
alter table if exists public.warehouse_settings
add column if not exists map_layout jsonb;

-- 2. Đảm bảo dòng cấu hình mặc định luôn tồn tại
insert into public.warehouse_settings (id, total_warehouses)
values ('default', 30)
on conflict (id) do nothing;
