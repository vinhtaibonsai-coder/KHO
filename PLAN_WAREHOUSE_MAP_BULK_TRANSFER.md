# KẾ HOẠCH TRIỂN KHAI: BẢN ĐỒ KHO TỰ DO & CHUYỂN NHIỀU MÃ HÀNG LOẠT (v3.1.0)

## I. MỤC TIÊU DỰ ÁN
1. **Bản đồ kho không gian thực tế (Interactive Warehouse Map):**
   - Hỗ trợ mô hình nhiều tòa nhà / cụm kho (Tòa A, Tòa B, Khu Xưởng, v.v.).
   - Các ô kho hình chữ nhật có thể tự do định vị, kéo thả, cách xa nhau hoặc xếp chồng lên nhau (mô phỏng kệ tầng, tầng lầu).
   - Tự động lưu và đồng bộ tọa độ bố cục (x, y, w, h, z-index / tầng) vào `localStorage` (và có thể xuất/nhập cấu hình).
   - Cho phép phóng to/thu nhỏ (Zoom & Pan) và chuyển đổi linh hoạt giữa: **Bản Đồ Không Gian Thực Tế** và **Sơ Đồ Lưới Tinh Gọn**.
2. **Chọn từng mã & Điều chuyển nhiều mã hàng loạt (Bulk Transfer):**
   - Hỗ trợ checkbox chọn từng mã lẻ hoặc nút "Chọn tất cả" / "Chọn theo Size" trong kho.
   - Thanh tác vụ điều khiển nổi phía dưới (Floating Action Bar) khi có $\ge 1$ mã được chọn.
   - Chọn kho đích và thực hiện điều chuyển an toàn toàn bộ các mã đã chọn chỉ với 1 thao tác, tự động cập nhật lịch sử chuyển kho cho từng mã.

---

## II. QUY CHUẨN THIẾT KẾ & KỸ THUẬT (CODING STANDARDS)
- **Framework & Ngôn ngữ:** Next.js (App Router), React 19, TypeScript nghiêm ngặt (`--noEmit` không có lỗi).
- **Styling:** Tailwind CSS, phong cách Design System ngọc lục bảo (Emerald & Slate) tương thích hoàn hảo iOS Safari PWA và Android.
- **Dữ liệu & Đồng bộ:**
  - Định dạng lưu trữ tọa độ kho:
    ```ts
    export interface WarehouseLayoutNode {
      id: number;              // Số kho (1, 2, ..., N)
      buildingId?: string;     // Mã tòa nhà / cụm (vd: "block-a", "block-b")
      x: number;               // Tọa độ X (pixel hoặc grid unit)
      y: number;               // Tọa độ Y
      width?: number;          // Chiều rộng ô
      height?: number;         // Chiều cao ô
      floor?: number;          // Tầng / Độ xếp chồng (z-index)
    }
    ```
- **Xử lý bất đồng bộ:** Tận dụng mutation queue có sẵn (`enqueueMutation`) để đảm bảo offline-first khi rớt mạng.

---

## III. CÁC BƯỚC THỰC HIỆN CHI TIẾT

### BƯỚC 1: Xây dựng tính năng "Chọn nhiều mã & Chuyển hàng loạt" trong Modal Kho
- **File tác động:**
  - `src/components/WarehouseDetailModal.tsx`
  - `src/app/page.tsx`
  - `src/app/api/items/route.ts` (Hỗ trợ bulk transfer nếu cần hoặc vòng lặp promise)
- **Nội dung công việc:**
  1. Thêm state `selectedSkus: Set<string>` trong `WarehouseDetailModal.tsx`.
  2. Bổ sung checkbox tùy chỉnh (Custom Checkbox iOS style) ở đầu mỗi thẻ mã sản phẩm.
  3. Thêm nút "Chọn tất cả" / "Bỏ chọn" và thống kê số lượng đang chọn.
  4. Tạo thanh công cụ nổi phía dưới modal:
     - Hiển thị: "Đã chọn **N** mã sản phẩm".
     - Chọn kho đích (Select Warehouse 1 -> 31).
     - Nút "Xác nhận chuyển N mã" kèm hộp thoại xác nhận `ConfirmModal`.
  5. Cập nhật hàm xử lý chuyển hàng loạt `onBulkTransfer(skus: string[], toWarehouse: number)` trong `page.tsx`.

### BƯỚC 2: Xây dựng Component Bản Đồ Kho Không Gian Thực Tế
- **File tạo mới:**
  - `src/components/WarehouseMapCanvas.tsx`
- **Nội dung công việc:**
  1. Khung Canvas 2D tương tác: hỗ trợ kéo thả (drag & drop), xếp chồng theo tầng (`floor / z-index`), và chia nhóm theo Tòa Nhà.
  2. Mỗi ô kho chữ nhật hiển thị:
     - Tên kho (vd: `KHO 01`, `KHO 14`), số lượng mã hiện có, badge cảnh báo đầy/trống.
     - Click vào để mở ngay modal chi tiết kho.
  3. Chế độ **"Chỉnh Sửa Bản Đồ" (Edit Layout Mode)**:
     - Kéo ô kho tới vị trí thực tế của xưởng/tòa nhà.
     - Nút "Thêm tòa nhà / cụm kho mới", "Xếp chồng lên kho khác".
     - Nút "Đặt lại bố cục mặc định" và "Lưu vị trí".
  4. Tự động lưu cấu hình layout vào `localStorage` key `xuong_lua_nhut_warehouse_map_layout_v1`.

### BƯỚC 3: Tích hợp vào Tab Sơ Đồ Kho trong `page.tsx`
- **File tác động:**
  - `src/app/page.tsx`
- **Nội dung công việc:**
  1. Thêm bộ chuyển đổi chế độ xem (View Toggle) ở đầu Tab 2:
     - **Bản Đồ Không Gian (Toà Nhà & Vị Trí)** 🗺️
     - **Sơ Đồ Lưới Gọn (Grid Cards)** 🗂️
  2. Kết nối dữ liệu tìm kiếm (`query`), highlight mã đang tìm kiếm trực tiếp trên cả 2 chế độ.

### BƯỚC 4: Kiểm thử, Tối ưu & Đóng gói
1. Chạy `npx tsc --noEmit` để đảm bảo chuẩn TypeScript 100%.
2. Kiểm tra thao tác kéo thả, chuyển mã trên thiết bị di động (cảm ứng touch).
3. Đưa các thay đổi vào `git add` sẵn sàng cho người dùng commit & push.
