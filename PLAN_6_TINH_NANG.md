# KẾ HOẠCH KỸ THUẬT 6 TÍNH NĂNG (v3.1) — Architecture & Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm 6 tính năng vào app kho Kho-30 — phân quyền 2 PIN, sao lưu/phục hồi theo thời điểm, âm thanh & rung, hoàn tác 10 giây, xuất/nhập Excel, quét mã vạch bằng camera.

**Architecture:** Mở rộng hệ thống auth sẵn có (scrypt PIN + HMAC session cookie) thêm claim `role` vào token, gate quyền ngay tại route handler (không chỉ ẩn nút phía client), gate phụ ở UI. Dữ liệu đi theo 2 backend sẵn có (Supabase / `data/database.json`) — mọi tính năng mới đều phải chạy được ở cả 2 chế độ. Toàn bộ logic nghiệp vụ mới đặt trên các API/`store.ts` đã có, không viết lại luồng mutation.

**Tech Stack:** Next.js 16 (App Router, `src/proxy.ts`), React 19, TypeScript strict, Tailwind v4, `@supabase/supabase-js`, PWA/IndexedDB (`idb`). Dependency mới (chỉ 2, đều dynamic-import): `xlsx`, `@zxing/browser`.

**Spec:** Yêu cầu người dùng (6 tính năng nêu trong brief) + hiện trạng khảo sát tại Mục I.

**Repo không có test runner** (package.json chỉ có `lint`, `build`, `auth:hash-pin`). Verification = `npm run lint` + `npx tsc --noEmit` + `npm run build` + các lệnh check thủ công ghi trong từng Task. **Không thêm framework test mới.**

## Global Constraints
- TypeScript strict qua `npx tsc --noEmit` (không có lỗi).
- `npm run lint` và `npm run build` phải xanh sau mỗi Đợt.
- Không thêm dependency ngoài `xlsx` và `@zxing/browser` (+peer `@zxing/library`).
- Tiếng Việt có dấu trong UI/logic trả về client; mã code/tên file tiếng Anh.
- Không lộ PIN hash / session secret ra client; không log PIN.
- Mọi endpoint mới phải chạy được khi `supabaseEnabled === false` (local `data/`).
- Phân quyền phải enforced **ở server** (route handler), UI chỉ là lớp ẩn nút.

## Review Focus (5 lỗi dễ mắc nhất)
1. **Session cũ không có `role` sau khi deploy** → mặc định `"admin"` (token cũ chỉ do người biết PIN Admin tạo ra); ghi chú để rotate `SESSION_SECRET` nếu muốn đốt toàn bộ session.
2. **Staff vẫn enqueue mutation offline được → server trả 403 → `syncManager` retry vô hạn** → Task 4: `processSyncQueue` nhận 403 thì `removeMutation` (không retry).
3. **Undo sau khi app đã poll lại (10s) → state server khác snapshot local** → undo dùng full-state `restore` (set toàn bộ trường), không dùng delta; xem Task 9.
4. **iOS Safari không có `BarcodeDetector`** → fallback `@zxing/browser` lazy-load, không được crash khi native thiếu (Task 12).
5. **Tạo snapshot trên mỗi request poll → tốn query** → cache biến module `lastSnapshotCheckDate`, mỗi process chỉ check 1 lần/ngày (Task 6).

---

# I. HIỆN TRẠNG SOURCE CODE (KHẢO SÁT)

## 1. Auth
- `src/lib/auth-pin.ts` — scrypt hash; đọc PIN theo thứ tự: Supabase `warehouse_settings.system_pin_hash` → `data/system_settings.json` → env `APP_PIN_HASH` → hash mặc định PIN 1809 (`getActivePinHash():32`, `updatePinInDatabase():78`, `verifyPin():117`).
- `src/lib/auth-session.ts` — token HMAC-SHA256, payload **chỉ có `{iat, exp}`** (TTL 12h), cookie `app_session` (`createSessionToken():39`, `verifySessionToken():48`).
- `src/proxy.ts` — chặn `/`, `/api/items/:path*`, `/api/simulator/:path*`; **chưa có** `/api/backup` hay `/api/auth/*`.
- `src/app/api/auth/{login,logout,session,change-pin}/route.ts` — login không rate limit, không role; `session` chỉ trả `{authenticated}`.
- **Chưa có khái niệm role/permission ở bất kỳ đâu** (grep `role|admin|viewer` = 0 kết quả nghiệp vụ).

## 2. Store / Data
- `src/lib/store.ts` (1163 dòng) — dual backend: Supabase (`warehouse_items`, `zalo_messages`, `warehouse_history`, `warehouse_settings`) hoặc `data/database.json`. Mutation: `markItemSold:510`, `restockItem:612`, `removeItem:719`, `transferItem:778`, `upsertItem:364`, `addQty:425`; mỗi mutation ghi `pushHistory` + `pushMessage`. Lock theo SKU: `withSkuLock:210`.
- `src/app/api/items/route.ts` — GET trả toàn bộ dữ liệu; POST xử lý action: `save_map_layout`, `set_warehouse_count`, `add_warehouse`, `mark_all_read`, `mark_read`, `mark_sold`, `restock`, `remove`, `transfer`, `add`/upsert.
- `src/app/api/items/batch-paste/route.ts` — nạp hàng loạt, validate qua `extractValidSkusFromText` (`src/lib/sku-rules.ts`).
- Offline: `src/pwa/db.ts` `enqueueMutation:108` + `src/pwa/syncManager.ts` `processSyncQueue:6`.

## 3. Camera / Scanner
- **Chưa có.** Chỉ có `navigator.vibrate` ở `src/app/login/page.tsx:25`. Không có `BarcodeDetector`, `getUserMedia`, `@zxing`, `html5-qrcode` nào trong repo.

## 4. Excel
- Xuất: `RightMenuDrawer.tsx:132 handleExportCSV` — CSV + BOM, 7 cột (STT, Mã SKU, Kho, Trạng thái, Tên, Số lượng, Thời gian cập nhật). **Đã có sẵn, chỉ thiếu .xlsx.**
- Nhập: `PasteImportModal.tsx:154` → POST `/api/items/batch-paste` (dán text). **Chưa nhận file.**
- Không có lib `xlsx`/`exceljs` nào được cài.

## 5. Chưa có (nền tảng cho 3 tính năng)
- Không có Toast component nào (`grep toast` = 0) → Undo cần tạo mới.
- Không có toggle âm thanh/rung; không có `AudioContext` nào.
- Không có bảng snapshot/backup nào.

## 6. UI nơi cần động vào (props hiện có)
- `src/app/page.tsx` (1103 dòng) — giữ toàn bộ handler: `removeSku:265`, `markSoldSku:280`, `restockSku:305`, `transferSku:325`, `bulkTransferSkus:343`, `bulkMarkSoldSkus:349`, `addWarehouseHandler:355`; poll 10s (`fetchData:101`); tab `paste` mở modal ở `handleTabSelect:423`.
- `WarehouseDetailModal.tsx:33` — props callbacks `onMarkSold/onTransfer/onRemove/onBulk*` (nút Đã bán:649, Chuyển kho:665, Xuất/Xóa ~304, bulk bar ~1135).
- `WarehouseMapCanvas.tsx:241` — state `edit` (bật sửa bố cục), toolbar ~1030-1117.
- `RightMenuDrawer.tsx` — Tạo kho:288, Xuất CSV:346, Đổi PIN:373, Logout:611.
- `BottomTabBar.tsx` — 5 tab, tab `paste` center-left.
- `SearchBar.tsx:46` — input `main-search-input` (nút X clear ở :61).

---

# II. LỘ TRÌNH 6 ĐỢT

| Đợt | Tính năng | Lý do xếp chỗ | File rìa chính | Phụ thuộc |
|-----|-----------|----------------|----------------|-----------|
| **1** | F1 — Phân quyền 2 PIN + rate limit | Nền tảng: mọi endpoint mới đều cần role gate | migration SQL, auth-*, proxy.ts, api/*, page.tsx + 4 component | — |
| **2** | F2 — Backup & Point-in-time restore | Data-safety trước khi test các đợt sau (có gì để khôi phục) | `lib/backup.ts`, `api/backup`, RightMenuDrawer | Đợt 1 (restore = admin) |
| **3** | F4 — Undo 10 giây | Dùng đúng action `restore` + gate vừa dựng | `UndoToast.tsx`, page.tsx, `lib/store.ts`, `api/items` | Đợt 1 |
| **4** | F5 — Xuất/Nhập Excel | Client-only + 1 dependency; import tái dùng PasteImportModal | RightMenuDrawer, PasteImportModal | Đợt 1 (nút nhập ẩn với staff) |
| **5** | F6 — Quét mã vạch camera | độc lập, 1 component mới | `BarcodeScanner.tsx`, SearchBar, page.tsx | — |
| **6** | F3 — Âm thanh & Haptic | rủi ro thấp nhất, làm cuối tránh conflict page.tsx | `audio.ts`, `app-settings.ts`, page.tsx, RightMenuDrawer | — |

Đợt 4/5/6 song song được với nhau sau Đợt 1. Mỗi Đợt = 1 commit riêng, app luôn chạy được giữa các Đợt.

---

# III. QUYẾT ĐỊNH KIẾN TRÚC CHUNG

**Mô hình vai trò**
- `"admin"` = PIN hiện tại (`system_pin_hash`), toàn quyền. `"staff"` = PIN mới `staff_pin_hash`, chỉ đọc.
- Session token mang thêm `role`. Payload cũ không có role → `"admin"` (compat).
- Chưa cấu hình `staff_pin_hash` → đăng nhập PIN nhân viên thất bại (an toàn mặc định).

**Enforcement 2 lớp**
1. Server (bắt buộc): `requireAdmin(req)` ở đầu handler của mọi action ghi trong `/api/items` POST, `/api/items/batch-paste`, `/api/backup`, `/api/auth/change-pin`. Proxy chỉ check "đã đăng nhập" (theo đúng cảnh báo của docs Next: verify authorization inside each handler).
2. Client (UX): `role` từ `GET /api/auth/session` → page.tsx truyền `canEdit` xuống component → **ẩn** (không phải disable) các nút: Đã bán, Chuyển kho, Xóa, bulk actions, tab Nhập dán, Sửa bố cục, Tạo kho, Đổi PIN, Phục hồi backup.

**Bảng lưu trữ mới/mới thêm (1 file migration chạy 1 lần trên Supabase SQL Editor):**
- `supabase_migration_roles_v3.sql` (Đợt 1): `warehouse_settings` + `staff_pin_hash text`, `pin_fail_count int not null default 0`, `pin_locked_until timestamptz`.
- `supabase_migration_backups_v4.sql` (Đợt 2): bảng `warehouse_backups`.
- Local fallback cùng pattern `auth-pin.ts`: `data/system_settings.json` thêm `staffPinHash/pinFailCount/pinLockedUntil`; backup vào `data/backups/*.json`.

**Không có**: bảng users, không JWT mới, không thư viện auth, không test framework mới.

---

# IV. CÁC ĐỢT & TASK

## ĐỢT 1 — F1: PHÂN QUYỀN 2 PIN + RATE LIMIT

### Task 1: Migration + storage đọc/ghi PIN staff & bộ đếm sai

**Files:**
- Create: `supabase_migration_roles_v3.sql`
- Create: `src/lib/auth-rate-limit.ts` (`import "server-only"`)
- Modify: `src/lib/auth-pin.ts` (thêm đọc/ghi `staff_pin_hash`)

**Interfaces:**
- Produces:
  - `getStaffPinHash(): Promise<string | null>` — trong `auth-pin.ts`, đọc đúng thứ tự Supabase → file local → `null`.
  - `setStaffPinHash(pin: string): Promise<void>` — hash rồi ghi cả 2 nơi (mirror `updatePinInDatabase:78`).
  - `checkPinLock(): Promise<{ locked: boolean; retryAfterSec: number }>`
  - `recordPinFailure(): Promise<{ locked: boolean; retryAfterSec: number }>` — đếm tới 5 thì set `locked_until = now + 5 phút`, reset bộ đếm.
  - `resetPinFailures(): Promise<void>` — gọi khi login thành công.
  - Hằng: `MAX_ATTEMPTS = 5`, `LOCK_MINUTES = 5`.

- [ ] **Step 1: Viết `supabase_migration_roles_v3.sql`** — pattern y hệt `supabase_migration_security_v2.sql`:
  ```sql
  alter table public.warehouse_settings add column if not exists staff_pin_hash text;
  alter table public.warehouse_settings add column if not exists pin_fail_count integer not null default 0;
  alter table public.warehouse_settings add column if not exists pin_locked_until timestamptz;
  ```
- [ ] **Step 2: Chạy file trên trên Supabase SQL Editor** (bỏ qua nếu chạy local mode).
- [ ] **Step 3: Implement `auth-rate-limit.ts`** — đọc/ghi `pin_fail_count`/`pin_locked_until` qua `warehouse_settings` (upsert row `id='default'`, y hệt `setWarehouseCount` trong `store.ts:850`), fallback `data/system_settings.json`; `retryAfterSec = ceil((locked_until - now)/1000)`.
- [ ] **Step 4: Thêm `getStaffPinHash`/`setStaffPinHash` vào `auth-pin.ts`** theo đúng cấu trúc 4-nấc của `getActivePinHash:32`.
- [ ] **Step 5: Verify** — `npx tsc --noEmit` && `npm run lint`; check tay: `node scripts/generate-pin-hash.mjs` (script sẵn có) để lấy hash, ghi vào `data/system_settings.json` key `staffPinHash`, chạy dev, log tạm `getStaffPinHash()` trả đúng hash.

### Task 2: Session token mang `role`

**Files:**
- Modify: `src/lib/auth-session.ts`

**Interfaces:**
- Produces: `type SessionRole = "admin" | "staff"`; `createSessionToken(secret?: string, role?: SessionRole, now?: number): Promise<string>` (mặc định `"admin"`); `getSessionRole(token?: string): Promise<SessionRole | null>` — `null` nếu token sai/hết hạn, ngược lại `payload.role ?? "admin"`.
- Consumes: `verifySessionToken` giữ nguyên (dùng cho proxy).

- [ ] **Step 1: Thêm `role` vào payload** của `createSessionToken:39` và parse ở `getSessionRole`.
- [ ] **Step 2: Verify** — `npx tsc --noEmit`; check tay trong dev: login → `document.cookie` không thấy (httpOnly) nên check bằng response `GET /api/auth/session` (Task 3).

### Task 3: Login rate limit + trả role; endpoint set PIN staff

**Files:**
- Modify: `src/app/api/auth/login/route.ts`
- Modify: `src/app/api/auth/session/route.ts`
- Modify: `src/app/api/auth/change-pin/route.ts`
- Modify: `src/app/login/page.tsx`

**Interfaces:**
- Consumes: `checkPinLock/recordPinFailure/resetPinFailures` (Task 1), `getStaffPinHash/setStaffPinHash` (Task 1), `getSessionRole/createSessionToken` (Task 2).
- Produces:
  - `POST /api/auth/login` body `{pin}` → 200 `{ok:true, role}` / 401 `{error}` / **429 `{error, retryAfterSec}`**.
  - `GET /api/auth/session` → `{authenticated: boolean, role: SessionRole | null}`.
  - `POST /api/auth/change-pin` body `{currentPin, newPin}` (giữ nguyên, Admin PIN) và `{currentPin, newStaffPin}` (đặt PIN Nhân viên, validate `/^\d{4}$/`) — cả hai đều verify bằng **Admin PIN hiện tại**.

- [ ] **Step 1: `login/route.ts`** — trước khi verify PIN: `const lock = await checkPinLock(); if (lock.locked) return 429 {error: "Sai PIN 5 lần, khóa 5 phút", retryAfterSec}`. Verify: đúng Admin hash → `role="admin"`; không thì đúng `getStaffPinHash()` → `role="staff"`; sai cả hai → `recordPinFailure()` + 401; đúng → `resetPinFailures()` + cookie `createSessionToken(secret, role)`.
- [ ] **Step 2: `session/route.ts`** — trả `{authenticated, role}` qua `getSessionRole`.
- [ ] **Step 3: `change-pin/route.ts`** — thêm nhánh `newStaffPin` (validate `/^\d{4}$/` + verify Admin PIN trước) → `setStaffPinHash`.
- [ ] **Step 4: `login/page.tsx`** — xử lý 429: hiện đếm ngược `retryAfterSec` (setState giây + `setInterval`), disable keypad tới khi hết, thông báo `"Khóa đăng nhập — thử lại sau 04:32"`. (Reuse pattern `triggerHaptic:25` sẵn có, không đổi.)
- [ ] **Step 5: Verify** — dev + curl:
  ```powershell
  1..6 | ForEach-Object { Invoke-WebRequest -Method Post http://localhost:3000/api/auth/login -ContentType application/json -Body '{"pin":"0000"}' -SkipHttpErrorCheck | Select-Object StatusCode }
  ```
  Kỳ vọng: 5×401 rồi 429. `GET /api/auth/session` trả `role` đúng sau khi login bằng từng PIN.

### Task 4: Gate quyền phía server + chống retry 403 offline

**Files:**
- Create: `src/lib/auth-role.ts` (`import "server-only"`)
- Modify: `src/app/api/items/route.ts`, `src/app/api/items/batch-paste/route.ts`
- Modify: `src/proxy.ts` (matcher)
- Modify: `src/pwa/syncManager.ts`

**Interfaces:**
- Produces: `getSessionRoleFromRequest(req: Request): Promise<SessionRole | null>` (tách cookie `app_session` từ header `cookie` → `getSessionRole`); `requireAdmin(req: Request): Promise<Response | null>` — trả `NextResponse.json({error:"Chỉ Admin mới thực hiện được"}, {status:403})` nếu không phải admin, `null` nếu đạt.
- Consumes: `getSessionRole` (Task 2).

- [ ] **Step 1: Viết `auth-role.ts`** với 2 hàm trên.
- [ ] **Step 2: `api/items/route.ts` POST** — sau khi parse body, với các action `save_map_layout | set_warehouse_count | add_warehouse | mark_sold | restock | remove | transfer | add` + action mặc định (upsert): `const gate = await requireAdmin(req); if (gate) return gate;`. GIỮ NGUYÊN cho `mark_read`, `mark_all_read` (staff được phép).
- [ ] **Step 3: `batch-paste/route.ts`** — `requireAdmin` đầu handler.
- [ ] **Step 4: `proxy.ts`** — thêm `"/api/backup/:path*"` vào `config.matcher` (Task 7 dùng tới; auth-only, role vẫn check trong handler).
- [ ] **Step 5: `syncManager.ts`** — sau khi `fetch` xong: nếu `res.status === 403` → `await removeMutation(item.id); continue;` (không đánh `failed`, không retry).
- [ ] **Step 6: Verify** — `npx tsc --noEmit` && `npm run lint`; curl bằng cookie staff (login staff, lấy `Set-Cookie`) POST `{"action":"mark_sold","sku":"E120.124"}` → 403; POST `{"action":"mark_read","id":"x"}` → không 403.

### Task 5: Ẩn nút phía client theo role

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/WarehouseDetailModal.tsx`, `WarehouseMapCanvas.tsx`, `RightMenuDrawer.tsx`

**Interfaces:**
- Consumes: `GET /api/auth/session` → `role` (Task 3).
- Produces: page.tsx state `role: SessionRole` (khởi tạo `"admin"` tránh nháy nút với Admin) + `const canEdit = role === "admin"` truyền xuống props mới `canEdit?: boolean` (mặc định `true`) cho 3 component; `role` truyền vào `RightMenuDrawer` (kiểu `SessionRole`).

- [ ] **Step 1: `page.tsx`** — `useEffect` fetch `/api/auth/session` một lần lúc mount → `setRole`. Truyền `canEdit` vào `WarehouseDetailModal`, `WarehouseMapCanvas`, `RightMenuDrawer`; chặn ở `handleTabSelect:423`: nếu tab `paste` && `!canEdit` → không mở modal, gọi `setError("Chế độ chỉ xem — liên hệ Admin")` (state `error` sẵn có ở `page.tsx:92`).
- [ ] **Step 2: `WarehouseDetailModal.tsx`** — `if (!canEdit)`: ẩn nút Đã bán (:649), Chuyển kho (:665), Xuất/Xóa, thanh bulk (:1135), nút Nhập dán. Giữ tab xem + Lịch sử.
- [ ] **Step 3: `WarehouseMapCanvas.tsx`** — `if (!canEdit)` chặn `setEdit(true)` và ẩn toolbar Sửa/Đồng bộ/Lưu (:1030-1117); zoom/pan/chọn kho vẫn chạy.
- [ ] **Step 4: `RightMenuDrawer.tsx`** — `role === "staff"`: ẩn "Tạo kho" (:288), "Đổi PIN" (:373); hiện badge `Chỉ xem` ở header; giữ Xuất file (đọc) và Đăng xuất.
- [ ] **Step 5: Verify** — `npm run lint` && `npx tsc --noEmit` && `npm run build`; tay: login staff → không thấy 5 nhóm nút; login admin → thấy đủ.

**✅ Ngưỡng Đợt 1:** build xanh, 4 check curl/tay ở trên qua. Commit: `feat(auth): 2-PIN role model + 5-min lockout + server role gate`.

---

## ĐỢT 2 — F2: SAO LƯU TỰ ĐỘNG + PHỤC HỒI THEO THỜI ĐIỂM

### Task 6: Migration bảng backup + `src/lib/backup.ts`

**Files:**
- Create: `supabase_migration_backups_v4.sql`
- Create: `src/lib/backup.ts` (`import "server-only"`)

**Interfaces:**
- Produces:
  - `type BackupMeta = { id: string; snapshotDate: string; itemCount: number; createdAt: string }`
  - `createSnapshot(reason?: string): Promise<BackupMeta>` — chụp `items + totalWarehouses + mapLayout`; Supabase → upsert `warehouse_backups`; local → ghi `data/backups/<ISO>.json`; prune giữ 30 bản.
  - `listSnapshots(): Promise<BackupMeta[]>` (mới nhất trước).
  - `getSnapshot(id: string): Promise<{ items: Item[]; totalWarehouses: number; mapLayout: MapLayout | null } | null>`
  - `restoreSnapshot(id: string): Promise<{ ok: boolean; itemCount: number; error?: string }>` — **tự tạo snapshot an toàn trước khi ghi đè**; xóa hết `warehouse_items` → insert lại snapshot; update `total_warehouses` + `map_layout` (local: `saveDB`); ghi 1 `zalo_messages` log `id = "restore_<id>"`.
  - `ensureDailySnapshot(): Promise<void>` — chỉ tạo nếu chưa có snapshot nào có `snapshot_date = hôm nay`; guard biến module `lastSnapshotCheckDate: string` (Review Focus #5).
- Consumes: `Item`, `MapLayout` (`src/types/index.ts`), pattern dual-backend từ `store.ts`.

SQL (`warehouse_backups`):
```sql
create table if not exists public.warehouse_backups (
  id text primary key, snapshot_date date not null,
  items jsonb not null, total_warehouses integer not null,
  map_layout jsonb, created_at timestamptz not null default now()
);
alter table public.warehouse_backups enable row level security;
```

- [ ] **Step 1: Viết + chạy migration** (SQL Editor).
- [ ] **Step 2: Implement `createSnapshot/listSnapshots/getSnapshot`** (chưa restore).
- [ ] **Step 3: Implement `restoreSnapshot` + `ensureDailySnapshot`.**
- [ ] **Step 4: Gọi `ensureDailySnapshot()`** ở đầu `GET` của `src/app/api/items/route.ts:27` (`.catch(() => undefined)` — không bao giờ làm hỏng GET).
- [ ] **Step 5: Verify** — `npx tsc --noEmit`; dev local: mở `/` → chạy GET → check file `data/backups/` có 1 file; mở lại vẫn chỉ 1 file trong ngày.

### Task 7: API `/api/backup` + UI Menu sao lưu

**Files:**
- Create: `src/app/api/backup/route.ts`
- Modify: `src/components/RightMenuDrawer.tsx`

**Interfaces:**
- Consumes: `requireAdmin` (Task 4), backup API (Task 6). Matcher `/api/backup/:path*` đã thêm ở Task 4.
- Produces:
  - `GET /api/backup` → `{ backups: BackupMeta[] }`; `GET /api/backup?id=<id>` → snapshot đầy đủ (dùng để tải về).
  - `POST /api/backup` body `{action:"create"}` → `{ok, backup}`; `{action:"restore", id}` → `{ok, itemCount}` (admin).
  - UI mới trong `RightMenuDrawer`: mục **"Sao lưu & Phục hồi"** — nút `Sao lưu ngay`, danh sách snapshot (ngày/giờ + số mã), mỗi dòng nút `Tải về` (tải JSON qua blob) và `Phục hồi` (mở `ConfirmModal` variant `danger`, chỉ render khi `role === "admin"`).

- [ ] **Step 1: Viết route `api/backup/route.ts`** — GET/POST theo interfaces trên; POST gọi `requireAdmin` trước.
- [ ] **Step 2: UI trong `RightMenuDrawer`** — fetch list khi mở drawer; `Tải về` = `fetch('/api/backup?id=...')` → `Blob` → `URL.createObjectURL` (pattern sẵn ở `handleExportCSV:148`).
- [ ] **Step 3: Verify** — `npm run lint` && `npx tsc --noEmit` && `npm run build`; tay: tạo 2 snapshot → sửa/xóa 1 mã → Phục hồi bản sớm hơn → mã trở lại đúng trạng thái; `POST restore` bằng cookie staff → 403; file JSON tải về mở được bằng Notepad.

**✅ Ngưỡng Đợt 2:** commit `feat(backup): daily snapshot + point-in-time restore + download`.

---

## ĐỢT 3 — F4: HOÀN TÁC 10 GIÂY

### Task 8: Component `UndoToast` + cơ chế hiện toast trong page.tsx

**Files:**
- Create: `src/components/UndoToast.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Produces:
  - `<UndoToast message: string; secondsLeft: number; onUndo: () => void; onDismiss: () => void />` — fixed `bottom-24`, thanh tiến trình 10s, nút `Hoàn tác`.
  - Trong `page.tsx`: `showUndoToast(message: string, onUndo: () => Promise<void> | void): void` — state `{message, onUndo, deadline}`, countdown bằng `setInterval` 100ms, hết 10s tự tắt; **toast mới thay toast cũ** (không queue).

- [ ] **Step 1: Viết `UndoToast.tsx`** (styles theo `ConfirmModal.tsx`, portal `createPortal`).
- [ ] **Step 2: Wire vào `page.tsx`** — `showUndoToast` như trên, render cuối `return`.
- [ ] **Step 3: Verify** — `npx tsc --noEmit`; dev: gán tạm `onClick` test gọi `showUndoToast("Đã bán E120.124", ...)` → toast đếm ngược 10s rồi tắt.

### Task 9: Chụp trạng thái trước đổi + hành động đảo ngược + action `restore`

**Files:**
- Modify: `src/app/page.tsx` (`runSkuMutation:241` và 4 handler)
- Modify: `src/lib/store.ts` (thêm `restoreItem`)
- Modify: `src/app/api/items/route.ts` (action `restore`)
- Modify: `src/pwa/db.ts` (trả queue id từ `enqueueMutation`)

**Interfaces:**
- Produces:
  - `store.restoreItem(snapshot: Item): Promise<Item>` — upsert full `{sku, name, warehouse, qty, status, soldAt, soldNote, updatedAt: now}` (khác `upsertItem:364` ở chỗ giữ `qty`/`status`), ghi history `action:"in"`, note `"Hoàn tác: ..."`.
  - API `POST {action:"restore", item: Item}` → validate `sku`/`warehouse`/`qty` → `requireAdmin` → `restoreItem`.
  - `page.tsx`: trước mỗi mutation chụp `before: Item | null = items.find(...)`; sau `res.ok` → `showUndoToast(msg, () => undoFn)`:
    | Action | Undo |
    |---|---|
    | `sold` | POST `{action:"restock", sku, warehouse: before.warehouse}` |
    | `transfer` | POST `{action:"transfer", sku, toWarehouse: before.warehouse}` |
    | `remove` | POST `{action:"restore", item: before}` |
    | `restock` | POST `{action:"restore", item: before}` |
    | bulk (transfer/sold) | một toast, undo = lặp đảo ngược từng sku |
    | offline (đã enqueue) | `removeMutation(queueId)` + revert local, không gọi API |
- Consumes: `enqueueMutation` (Task đổi ở Step 1 trả `{id}`), `removeMutation` sẵn có.

- [ ] **Step 1: `pwa/db.ts`** — `enqueueMutation` trả về `SyncQueueItem` đã có; trong `runSkuMutation:256` bắt `const q = await enqueueMutation(...)` rồi đưa `q.id` vào closure undo.
- [ ] **Step 2: Thêm `restoreItem` vào `store.ts` + route `restore` vào `api/items/route.ts`** (đứng sau `requireAdmin` gộp ở Task 4 — thêm `restore` vào danh sách action cần admin).
- [ ] **Step 3: `page.tsx`** — chụp `before` ở đầu `runSkuMutation` (nhận thêm param `undoInfo`), sau thành công gọi `showUndoToast` theo bảng trên; mỗi handler (`removeSku/markSoldSku/restockSku/transferSku`) cung cấp nhãn tiếng Việt: `"Đã bán {sku}"`, `"Đã chuyển {sku} sang Kho X"`, `"Đã xuất {sku}"`, `"Đã nhập lại {sku}"`.
- [ ] **Step 4: Verify** — `npm run lint` && `npx tsc --noEmit` && `npm run build`; tay trên dev: bán 1 mã → bấm Hoàn tác trong 10s → mã active lại ở đúng kho, history có bản ghi `"Hoàn tác"`; thử với bulk transfer; thử tắt mạng (DevTools offline) → undo thì hàng không bị enqueue nữa.

**✅ Ngưỡng Đợt 3:** commit `feat(undo): 10-second undo toast with full-state restore`.

---

## ĐỢT 4 — F5: XUẤT / NHẬP FILE EXCEL 1-CLICK

### Task 10: Xuất `.xlsx` (tái dùng cột của CSV)

**Files:**
- Modify: `package.json` (thêm `"xlsx": "^0.18.5"`)
- Modify: `src/components/RightMenuDrawer.tsx`

**Interfaces:**
- Produces: `handleExport(format: "csv" | "xlsx"): void` — tách `buildRows()` (headers + rows hiện tại ở `handleExportCSV:137-146`) dùng chung cho cả 2 định dạng; `xlsx` load bằng `await import("xlsx")` (không bundle vào trang chính).
- Cột: giữ nguyên 7 cột hiện có (bao phủ đúng yêu cầu: Mã, Kho, Ngay nhap = cột "Thời Gian Cập Nhật", Trạng thái). **Quyết định:** dùng `updatedAt` làm "Ngay nhap" vì app không lưu ngày nhập riêng.

- [ ] **Step 1: `npm i xlsx`.**
- [ ] **Step 2: Refactor `handleExportCSV` → `buildRows()` + `handleExport(format)`**: `csv` giữ nguyên đường đi BOM cũ; `xlsx` → `XLSX.utils.json_to_sheet(rows)` → `XLSX.writeFile(wb, "Bao_Cao_Kho_...xlsx")`.
- [ ] **Step 3: UI** — nút "Tải Excel" hiện tại (`:358`) mở 2 lựa chọn nhỏ: `Excel (.xlsx)` / `CSV (.csv)` (menu 2 dòng inline, không modal mới).
- [ ] **Step 4: Verify** — `npm run lint` && `npx tsc --noEmit` && `npm run build`; tay: xuất cả 2 file, mở bằng Excel thật, cột tiếng Việt không lỗi font, đủ số dòng = `items.length`.

### Task 11: Nhập file Excel/CSV vào kho (dán lại đường đi Paste Import)

**Files:**
- Modify: `src/components/PasteImportModal.tsx`

**Interfaces:**
- Consumes: `extractValidSkusFromText` + POST `/api/items/batch-paste` sẵn có (không đổi server).
- Produces: handler `handleFileSelect(file: File)` — `const XLSX = await import("xlsx")` → `XLSX.read(await file.arrayBuffer())` → lấy sheet đầu → tìm dòng header có ô match `/^(mã?\s*sku|ma|sku)/i` (fallback: cột 0) → ghép các giá trị hợp lệ bằng `\n` → `setRawText(...)` → flow preview/xác nhận hiện tại chạy y hệt.

- [ ] **Step 1: Thêm `<input type="file" accept=".xlsx,.xls,.csv">` + nút "Nhập từ file Excel"** vào khu vực dán của `PasteImportModal` (ẩn input, bấm nút trigger — pattern `<X />` sẵn có).
- [ ] **Step 2: Implement `handleFileSelect`** như trên; lỗi parse → `setStatus({type:"error", msg:"Không đọc được file"})`.
- [ ] **Step 3: Verify** — `npm run lint` && `npx tsc --noEmit` && `npm run build`; tay: xuất file ở Task 10 → xoá trắng → nhập lại chính file đó → preview hiện đúng danh sách mã, nạp vào kho chạy qua `batch-paste`.

**✅ Ngưỡng Đợt 4:** commit `feat(excel): xlsx export + spreadsheet import via paste pipeline`.

---

## ĐỢT 5 — F6: QUÉT MÃ VẠCH / QR BẰNG CAMERA

### Task 12: Component `BarcodeScanner` + nút camera trên SearchBar

**Files:**
- Create: `src/components/BarcodeScanner.tsx`
- Create: `src/types/barcode-detector.d.ts` (khai báo minimal `BarcodeDetector` vì TS lib chưa có)
- Modify: `package.json` (`@zxing/browser`, `@zxing/library`)
- Modify: `src/components/SearchBar.tsx`, `src/app/page.tsx`

**Interfaces:**
- Produces:
  - `<BarcodeScanner isOpen: boolean; onDetect: (code: string) => void; onClose: () => void />` — overlay + `<video playsInline autoPlay muted>`; luồng: `"BarcodeDetector" in window` → dùng native (`new BarcodeDetector({formats:["code_128","qr_code","ean_13"]})` loop `requestAnimationFrame`); không có → `await import("@zxing/browser")` → `BrowserMultiFormatReader.decodeFromVideoElement(...)`. `stream.getTracks().forEach(t => t.stop())` khi đóng. Lỗi `NotAllowedError` → thông báo "Cần cho phép camera (dùng HTTPS)".
  - `SearchBar` thêm prop `onScan?: () => void` → render nút `<Camera />` bên trong ô input, chỉ hiện khi `value` rỗng và trên mobile (class `sm:hidden`).
- Consumes: `setQuery`/`searchInputRef` ở `page.tsx`.

- [ ] **Step 1: `npm i @zxing/browser @zxing/library`.**
- [ ] **Step 2: Viết `barcode-detector.d.ts`** (interface tối thiểu: constructor, `detect(HTMLCanvasElement|HTMLVideoElement)`).
- [ ] **Step 3: Viết `BarcodeScanner.tsx`** như interfaces — quan trọng: dừng track khi đóng, chặn 2 lần detect cùng mã trong 500ms (tránh lặp), auto-close sau khi detect 1 lần.
- [ ] **Step 4: `SearchBar.tsx`** thêm nút camera + prop `onScan`.
- [ ] **Step 5: `page.tsx`** — state `isScanning`; `onDetect: (code) => { setQuery(code); setIsScanning(false); searchInputRef.current?.focus(); }`.
- [ ] **Step 6: Verify** — `npm run lint` && `npx tsc --noEmit` && `npm run build`; tay trên điện thoại (HTTPS/localhost): quét mã in trên giấy → ô tìm kiếm tự điền → hiện đúng mã; trên Safari iOS (không có native) → fallback ZXing vẫn quét được; đóng modal → đèn camera tắt.

**✅ Ngưỡng Đợt 5:** commit `feat(scanner): camera barcode scanner wired to search`.

---

## ĐỢT 6 — F3: ÂM THANH (TING) & RUNG (HAPTIC)

### Task 13: Settings toggle + thư viện âm thanh/rung

**Files:**
- Create: `src/lib/app-settings.ts` (client)
- Create: `src/lib/audio.ts` (client)
- Create: `src/lib/haptics.ts` (client)
- Modify: `src/components/RightMenuDrawer.tsx`

**Interfaces:**
- Produces:
  - `app-settings.ts`: `type AppSettings = { sound: boolean; haptic: boolean }`; `getSettings(): AppSettings` (mặc định `{sound:true, haptic:true}`, localStorage key `lua_settings`); `setSettings(patch: Partial<AppSettings>): AppSettings` + event `lua_settings_changed` (dispatch `window.dispatchEvent`) để component khác tự re-render.
  - `audio.ts` — **Web Audio synthetize, không file ngoài**: `playTone(freq: number, ms: number, type?: OscillatorType): void` (lazy 1 `AudioContext`, `resume()` khi có gesture đầu tiên, best-effort nếu bị chặn); `tingNewMessage()` = chuỗi 2 nốt `880→1174Hz, 90ms`; `tingFound()` = 1 nốt `1318Hz, 120ms`; cả 2 đều bọc `if (!getSettings().sound) return;`.
  - `haptics.ts`: `vibrate(pattern: number | number[]): void` — guard `"vibrate" in navigator` (copy pattern từ `login/page.tsx:25`), bọc `if (!getSettings().haptic) return;`.
- UI: mục **"Âm thanh & Rung"** trong `RightMenuDrawer` — 2 switch (Không component switch mới, dùng `<button>` 2 trạng thái theo style menu sẵn có).

- [ ] **Step 1: Viết 3 file lib** theo interfaces.
- [ ] **Step 2: Thêm mục toggle vào `RightMenuDrawer`** — đọc `getSettings()`, `setSettings({sound: !x})` + bấm thử: `tingFound()` để preview âm.
- [ ] **Step 3: Verify** — `npx tsc --noEmit` && `npm run lint`; tay: tắt âm → bấm preview không kêu; mở lại → kêu; reload trang → giữ nguyên trạng thái toggle.

### Task 14: Kích hoạt ting khi có tin Zalo mới + ting/rung khi tìm thấy mã

**Files:**
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `tingNewMessage`, `tingFound` (Task 13); `matchingItems` (`page.tsx:190`).

- [ ] **Step 1: Tin Zalo mới** — ref `seenMessageIdsRef = useRef<Set<string>>(new Set())`; `useEffect` theo `messages`: id nào chưa có trong set và `id` không bắt đầu `bot_heartbeat` → `tingNewMessage()` + `vibrate(20)`; lần đầu tiên (mount) chỉ nạp set, **không kêu** (tránh ting khi vừa mở app).
- [ ] **Step 2: Tìm thấy mã** — `useEffect` theo `activeFoundItem` + `query`: chỉ khi `query.length >= 3` và khớp **chính xác tuyệt đối** (`activeFoundItem.sku === query`) và id item khác lần trước → `tingFound()` + `vibrate([0, 30])`. (Guard bằng ref `lastFoundSkuRef` để không ting lại khi poll 10s trả cùng 1 kết quả.)
- [ ] **Step 3: Verify** — `npm run lint` && `npx tsc --noEmit` && `npm run build`; tay: mở tab Zalo Simulator (`RightMenuDrawer` dev tab sẵn có) gửi tin nổ hàng → nghe ting; gõ đúng mã `E120.124` → ting + rung; tắt âm/tắt rung ở Task 13 → cả hai im.

**✅ Ngưỡng Đợt 6 = Hoàn thành 6/6:** `npm run lint` && `npx tsc --noEmit` && `npm run build` xanh; chạy full tay theo checklist Review Focus; commit `feat(audio): synthesized ting + haptic with settings toggle`.

---

# V. RANH GIỚI & LƯU Ý (giới hạn đã chấp nhận có chủ đích)
- **Undo chỉ cho thao tác gần nhất, cửa sổ 10s, không phải lịch sử栈** — quá 10s dùng Backup (Đợt 2) hoặc thao tác thủ công.
- **Snapshot backup = items + settings (kho, bố cục)**, không snapshot `zalo_messages`/`warehouse_history` (giữ làm nhật ký audit không bị đụng tới khi phục hồi).
- **Rate limit tính tổng toàn hệ thống** (5 sai → khóa 5 phút cho mọi người), không theo IP: sau Vercel mọi IP như nhau, còn self-host chạy trong LAN tin cậy. Muốn per-IP thì thêm key theo `x-forwarded-for` vào `auth-rate-limit.ts`.
- **Backup local (`data/backups/`) chỉ sống được khi self-host** — trên Vercel fs ephemeral, Supabase là nơi sống thật (đã là mô hình dual-backend hiện có).
- **iOS Safari không có `BarcodeDetector`** → luôn phải giữ fallback `@zxing/browser` (đừng gỡ).
- **`xlsx` (SheetJS 0.18.5 từ npm)**: dynamic import, chỉ tải lúc bấm xuất/nhập.
- **Session cũ không role → admin**; muốn đốt sạch session khi deploy thì đổi `SESSION_SECRET`.
