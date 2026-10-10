import { NextResponse } from "next/server";
import {
  addQty,
  addWarehouse,
  findItem,
  getHistory,
  getItems,
  getMessages,
  getWarehouseCount,
  getWarehouseMapLayout,
  saveWarehouseMapLayout,
  getBotStatus,
  getDatabaseStatus,
  markAllMessagesRead,
  markItemSold,
  markMessageRead,
  removeItem,
  restockItem,
  setWarehouseCount,
  transferItem,
  upsertItem,
  withSkuLock,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [items, messages, history, totalWarehouses, mapLayout, botStatus, dbStatus] = await Promise.all([
      getItems(),
      getMessages(),
      getHistory(),
      getWarehouseCount(),
      getWarehouseMapLayout(),
      getBotStatus(),
      getDatabaseStatus(),
    ]);
    return NextResponse.json({
      items,
      messages,
      history,
      totalWarehouses,
      mapLayout,
      botStatus,
      dbStatus,
    });
  } catch (err) {
    console.error("API GET /api/items lỗi:", err);
    return NextResponse.json({ error: "Không đọc được dữ liệu" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }

  try {
    // 0. Lưu bố cục sơ đồ kho
    if (body.action === "save_map_layout" && body.layout) {
      const saved = await saveWarehouseMapLayout(body.layout);
      return NextResponse.json({ ok: true, layout: saved });
    }

    // 0. Đặt lại số lượng kho
    if (body.action === "set_warehouse_count" && body.count) {
      const newTotal = await setWarehouseCount(Number(body.count));
      return NextResponse.json({ ok: true, totalWarehouses: newTotal });
    }

    // 1. Thêm kho mới
    if (body.action === "add_warehouse") {
      const newTotal = await addWarehouse();
      return NextResponse.json({ ok: true, totalWarehouses: newTotal });
    }

    // 2. Đánh dấu tất cả thông báo đã đọc
    if (body.action === "mark_all_read") {
      await markAllMessagesRead();
      return NextResponse.json({ ok: true });
    }

    // 3. Đánh dấu 1 thông báo cụ thể đã đọc
    if (body.action === "mark_read" && body.id) {
      await markMessageRead(String(body.id));
      return NextResponse.json({ ok: true });
    }

    const totalWarehouses = await getWarehouseCount();

    if (!body.sku || typeof body.sku !== "string") {
      return NextResponse.json({ error: "Thiếu sku" }, { status: 400 });
    }

    if (body.action === "mark_sold") {
      const note = typeof body.note === "string" ? body.note : "Đã bán";
      const sold = await withSkuLock(body.sku, () => markItemSold(body.sku, note));
      if (!sold) {
        return NextResponse.json({ error: `Không tìm thấy ${body.sku}` }, { status: 404 });
      }
      return NextResponse.json({ ok: true, sold });
    }

    if (body.action === "restock") {
      const warehouse = body.warehouse ? Number(body.warehouse) : undefined;
      const note = typeof body.note === "string" ? body.note : "Khách trả / Nhập lại kho";
      const restocked = await withSkuLock(body.sku, () => restockItem(body.sku, warehouse, note));
      if (!restocked) {
        return NextResponse.json({ error: `Không tìm thấy ${body.sku}` }, { status: 404 });
      }
      return NextResponse.json({ ok: true, restocked });
    }

    if (body.action === "remove") {
      const note = typeof body.note === "string" ? body.note : "Xuất kho thủ công";
      const removed = await withSkuLock(body.sku, () => removeItem(body.sku, note));
      if ("alreadyRemoved" in removed) {
        // Đã xoá rồi / không tồn tại -> 200 để client không enqueue retry
        return NextResponse.json({ ok: true, alreadyRemoved: true });
      }
      return NextResponse.json({ ok: true, removed });
    }

    if (body.action === "transfer") {
      const toWarehouse = Number(body.toWarehouse);
      if (!Number.isInteger(toWarehouse) || toWarehouse < 1 || toWarehouse > totalWarehouses) {
        return NextResponse.json({ error: `Kho đích không hợp lệ (1-${totalWarehouses})` }, { status: 400 });
      }
      const note = typeof body.note === "string" ? body.note : "";
      const result = await withSkuLock(body.sku, () => transferItem(body.sku, toWarehouse, note));
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, ...result });
    }

    const warehouse = Number(body.warehouse);
    if (!Number.isInteger(warehouse) || warehouse < 1 || warehouse > totalWarehouses) {
      return NextResponse.json({ error: `warehouse không hợp lệ (1-${totalWarehouses})` }, { status: 400 });
    }

    const item =
      body.action === "add"
        ? await addQty(body.sku, warehouse, Number(body.qty) || 1)
        : await upsertItem(body.sku, warehouse, body.name);
    return NextResponse.json({ ok: true, item, exists: !!(await findItem(body.sku)) });
  } catch (err) {
    console.error("API /api/items lỗi:", err);
    return NextResponse.json({ error: "Không ghi được dữ liệu" }, { status: 500 });
  }
}

