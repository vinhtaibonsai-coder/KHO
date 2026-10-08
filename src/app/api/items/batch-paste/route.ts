import { NextResponse } from "next/server";
import { upsertItem, pushMessage, TOTAL_WAREHOUSES, findItem } from "@/lib/store";
import { extractValidSkusFromText } from "@/lib/sku-rules";
import type { ZaloMessage } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const warehouse = Number(body?.warehouse);
    const rawText = String(body?.text || "").trim();

    if (!Number.isInteger(warehouse) || warehouse < 1 || warehouse > TOTAL_WAREHOUSES) {
      return NextResponse.json({ error: "warehouse không hợp lệ (1-30)" }, { status: 400 });
    }

    if (!rawText) {
      return NextResponse.json({ error: "Nội dung đoạn chat trống" }, { status: 400 });
    }

    const { validSkus, details } = extractValidSkusFromText(rawText);
    if (validSkus.length === 0) {
      return NextResponse.json({
        ok: false,
        error: "Không tìm thấy mã sản phẩm đúng quy chuẩn trong đoạn chat! (Quy chuẩn: E/K/P/S + {60,80,90,100,135,150,160}.STT hoặc PT/PCT/BC + STT)",
      }, { status: 400 });
    }

    // Lọc trùng lặp ngay trong danh sách input (nếu người dùng paste lặp lại 1 mã trong cùng đoạn text)
    const uniqueValidSkus = Array.from(new Set(validSkus));

    const importedItems = [];
    const duplicates: { sku: string; existingWarehouse: number; reason: string }[] = [];
    const successfullyAdded: string[] = [];

    for (const sku of uniqueValidSkus) {
      // KIỂM TRA TRÙNG MÃ:
      // Hàng độc bản đang active:
      // - Nếu đang ở kho khác -> trùng kho khác
      // - Nếu đang ở chính kho này -> đã có sẵn trong kho, không nạp đè/thêm
      const existing = await findItem(sku);
      if (existing && existing.status !== "sold") {
        if (existing.warehouse !== warehouse) {
          duplicates.push({
            sku,
            existingWarehouse: existing.warehouse,
            reason: `Đang ở Kho ${existing.warehouse}`,
          });
        } else {
          duplicates.push({
            sku,
            existingWarehouse: existing.warehouse,
            reason: `Đã có sẵn trong Kho ${warehouse}`,
          });
        }
        continue;
      }

      const it = await upsertItem(sku, warehouse);
      importedItems.push(it);
      successfullyAdded.push(sku);
    }

    let detailMsg = `Đã nạp ${successfullyAdded.length} mã vào Kho ${warehouse}`;
    if (duplicates.length > 0) {
      detailMsg += `. Bỏ qua ${duplicates.length} mã trùng: ${duplicates.map(d => `${d.sku} (${d.reason})`).join(", ")}`;
    }

    // Ghi lại vào nhật ký tin nhắn
    const logMsg: ZaloMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      groupId: `KHO_${String(warehouse).padStart(2, "0")}`,
      warehouse,
      message: `[Dán đoạn chat cũ] Nạp ${successfullyAdded.length}/${validSkus.length} mã`,
      status: duplicates.length > 0 && successfullyAdded.length === 0 ? "error" : "ok",
      detail: detailMsg,
      createdAt: new Date().toISOString(),
    };
    await pushMessage(logMsg);

    return NextResponse.json({
      ok: successfullyAdded.length > 0,
      warehouse,
      totalFound: validSkus.length,
      totalImported: successfullyAdded.length,
      skus: successfullyAdded,
      duplicates,
      details,
      items: importedItems,
      message: logMsg,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Lỗi xử lý dán mã";
    console.error("API /api/items/batch-paste lỗi:", err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
