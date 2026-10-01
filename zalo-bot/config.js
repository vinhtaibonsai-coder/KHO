/**
 * BẢNG ÁNH XẠ NHÓM ZALO ➔ SỐ KHO (1 ĐẾN 30)
 * Bạn có thể điền Group ID thật của Zalo hoặc Bot sẽ tự động trích xuất số kho từ tên nhóm.
 * Ví dụ: Nhóm có tên chứa "Kho 05", "Kho 5", "KHO_05" -> Tự động nhận diện là Kho 5.
 */
module.exports = {
  // Cấu hình URL Webhook nhận tin nhắn (Local hoặc Vercel)
  WEBHOOK_URL: process.env.WEBHOOK_URL || "http://localhost:3000/api/webhook/zalo",

  // Cấu hình map thủ công nếu tên nhóm không có chữ số (tùy chọn)
  // "id_nhom_zalo_1": "KHO_01",
  // "id_nhom_zalo_2": "KHO_02",
};
