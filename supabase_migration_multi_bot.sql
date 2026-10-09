-- Migration đa máy (Multi-Bot 2 máy):
-- 1) Cột bot_name: gắn tin nhắn / heartbeat với tên máy bot gửi lên (May 1, May 2...)
-- 2) Heartbeat đa bot được lưu trong zalo_messages với id = 'bot_heartbeat_<ten bot>'
--    (mỗi bot upsert 1 dòng riêng -> web hiển thị trạng thái từng máy)
alter table public.zalo_messages add column if not exists bot_name text;
