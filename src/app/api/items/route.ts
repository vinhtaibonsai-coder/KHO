import { NextResponse } from "next/server";
import {
  addQty,
  findItem,
  getHistory,
  getItems,
  getMessages,
  removeItem,
  TOTAL_WAREHOUSES,
  transferItem,
  upsertItem,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [items, messages, history] = await Promise.all([
      getItems(),
      getMessages(),
      getHistory(),
    ]);
    return NextResponse.json({
      items,
      messages,
      history,
      totalWarehouses: TOTAL_WAREHOUSES,
    });
  } catch (err) {
    console.error("API GET /api/items lỗi:", err);
    return NextResponse.json({ error: "Không đọc được dữ liệu" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.sku || typeof body.sku !== "string") {
    return NextResponse.json({ error: "Thiếu sku" }, { status: 400 });
  }

  try {
    if (body.action === "remove") {
      const note = typeof body.note === "string" ? body.note : "Xuất kho thủ công";
      const removed = await removeItem(body.sku, note);
      if (!removed) {
        return NextResponse.json({ error: `Không tìm thấy ${body.sku}` }, { status: 404 });
      }
      return NextResponse.json({ ok: true, removed });
    }

    if (body.action === "transfer") {
      const toWarehouse = Number(body.toWarehouse);
      if (!Number.isInteger(toWarehouse) || toWarehouse < 1 || toWarehouse > TOTAL_WAREHOUSES) {
        return NextResponse.json({ error: "Kho đích không hợp lệ (1-30)" }, { status: 400 });
      }
      const note = typeof body.note === "string" ? body.note : "";
      const result = await transferItem(body.sku, toWarehouse, note);
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, ...result });
    }

    const warehouse = Number(body.warehouse);
    if (!Number.isInteger(warehouse) || warehouse < 1 || warehouse > TOTAL_WAREHOUSES) {
      return NextResponse.json({ error: "warehouse không hợp lệ (1-30)" }, { status: 400 });
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
