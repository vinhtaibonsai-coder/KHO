import { NextResponse } from "next/server";
import { addQty, pushMessage, removeItem, upsertItem, findItem } from "@/lib/store";
import { validateSku, extractValidSkusFromText } from "@/lib/sku-rules";
import type { ZaloMessage } from "@/types";

export const dynamic = "force-dynamic";

function parseWarehouse(groupId: string): number | null {
  const m = groupId.match(/(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 30 ? n : null;
}

function parseMessage(text: string): { action: "in" | "out" | "assign"; sku: string; qty: number; error?: string } | null {
  const clean = text.trim();

  // Dạng 1: -MÃ (Xuất kho)
  if (clean.startsWith("-")) {
    const rawSku = clean.slice(1).trim();
    const val = validateSku(rawSku);
    if (!val.valid) return { action: "out", sku: rawSku, qty: 1, error: val.error };
    return { action: "out", sku: val.normalizedSku, qty: 1 };
  }

  // Dạng 2: +MÃ (Nhập kho)
  if (clean.startsWith("+")) {
    const rawSku = clean.slice(1).trim();
    const val = validateSku(rawSku);
    if (!val.valid) return { action: "in", sku: rawSku, qty: 1, error: val.error };
    return { action: "in", sku: val.normalizedSku, qty: 1 };
  }

  // Dạng 3: NK MÃ
  const nkMatch = clean.match(/^NK\s+([^\s]+)/i);
  if (nkMatch) {
    const val = validateSku(nkMatch[1]);
    if (!val.valid) return { action: "in", sku: nkMatch[1], qty: 1, error: val.error };
    return { action: "in", sku: val.normalizedSku, qty: 1 };
  }

  // Dạng 4: XK MÃ
  const xkMatch = clean.match(/^XK\s+([^\s]+)/i);
  if (xkMatch) {
    const val = validateSku(xkMatch[1]);
    if (!val.valid) return { action: "out", sku: xkMatch[1], qty: 1, error: val.error };
    return { action: "out", sku: val.normalizedSku, qty: 1 };
  }

  // Dạng 5: Nhắn trực tiếp mã sản phẩm
  const val = validateSku(clean);
  if (val.valid) {
    return { action: "assign", sku: val.normalizedSku, qty: 1 };
  }

  return { action: "assign", sku: clean, qty: 1, error: val.error };
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body?.groupId || !body?.message) {
    return NextResponse.json({ ok: false, error: "Thiếu groupId hoặc message" }, { status: 400 });
  }

  try {
    const warehouse = parseWarehouse(body.groupId);
    if (!warehouse) {
      const msg: ZaloMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        groupId: body.groupId,
        warehouse: null,
        message: body.message,
        status: "error",
        detail: "Không nhận diện được số kho từ tên nhóm",
        createdAt: new Date().toISOString(),
      };
      await pushMessage(msg);
      return NextResponse.json({ ok: false, message: msg }, { status: 400 });
    }

    // 1. Kiểm tra xem tin nhắn có chứa nhiều mã không
    const extracted = extractValidSkusFromText(body.message);

    if (extracted.validSkus.length > 1) {
      // Tin nhắn chứa nhiều mã cùng lúc (VD: E100.484 E100.489 E100.500... hoặc PT305 PT303 PT304)
      const isOut = body.message.trim().startsWith("-") || body.message.trim().toUpperCase().startsWith("XK");
      const added: string[] = [];
      const duplicates: string[] = [];

      for (const sku of extracted.validSkus) {
        if (isOut) {
          await removeItem(sku);
          added.push(sku);
        } else {
          // Kiểm tra trùng mã ở kho khác
          const existing = await findItem(sku);
          if (existing && existing.warehouse !== warehouse) {
            duplicates.push(`${sku} (ở Kho ${existing.warehouse})`);
            continue;
          }
          await upsertItem(sku, warehouse);
          added.push(sku);
        }
      }

      let detail = isOut 
        ? `Đã xuất ${added.length} mã khỏi Kho ${warehouse}` 
        : `Đã nạp thành công ${added.length}/${extracted.validSkus.length} mã vào Kho ${warehouse}: ${added.slice(0, 5).join(", ")}${added.length > 5 ? "..." : ""}`;
      
      if (duplicates.length > 0) {
        detail += ` | Bỏ qua trùng: ${duplicates.join(", ")}`;
      }

      const msg: ZaloMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        groupId: body.groupId,
        warehouse,
        message: body.message,
        status: added.length > 0 ? "ok" : "error",
        detail,
        createdAt: new Date().toISOString(),
      };
      await pushMessage(msg);

      return NextResponse.json({
        ok: added.length > 0,
        message: msg,
        total: extracted.validSkus.length,
        addedCount: added.length,
        duplicates,
      });
    }

    // 2. Xử lý trường hợp tin nhắn chứa 1 mã đơn lẻ
    const parsed = parseMessage(body.message);
    if (!parsed || parsed.error) {
      const msg: ZaloMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        groupId: body.groupId,
        warehouse,
        message: body.message,
        status: "error",
        detail: parsed?.error || "Cú pháp mã không hợp lệ",
        createdAt: new Date().toISOString(),
      };
      await pushMessage(msg);
      return NextResponse.json({ ok: false, message: msg }, { status: 400 });
    }

    // NGĂN CHẶN TRÙNG MÃ: Hàng độc bản chỉ được ở 1 kho duy nhất
    if (parsed.action !== "out") {
      const existing = await findItem(parsed.sku);
      if (existing && existing.warehouse !== warehouse) {
        const msg: ZaloMessage = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          groupId: body.groupId,
          warehouse,
          message: body.message,
          status: "error",
          detail: `CẢNH BÁO TRÙNG MÃ: [${parsed.sku}] hiện đang nằm ở Kho ${existing.warehouse}. Không thể nạp trùng vào Kho ${warehouse}!`,
          createdAt: new Date().toISOString(),
        };
        await pushMessage(msg);
        return NextResponse.json({ ok: false, message: msg, duplicate: true }, { status: 409 });
      }
    }

    // Xử lý cập nhật vào Store
    let detail = "";
    if (parsed.action === "out") {
      await removeItem(parsed.sku);
      detail = `Đã xuất mã [${parsed.sku}] khỏi kho`;
    } else if (parsed.action === "in") {
      await addQty(parsed.sku, warehouse, parsed.qty);
      detail = `Đã nhập [${parsed.sku}] (+${parsed.qty}) vào Kho ${warehouse}`;
    } else {
      await upsertItem(parsed.sku, warehouse);
      detail = `Đã gán vị trí [${parsed.sku}] vào Kho ${warehouse}`;
    }

    const msg: ZaloMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      groupId: body.groupId,
      warehouse,
      message: body.message,
      status: "ok",
      detail,
      createdAt: new Date().toISOString(),
    };
    await pushMessage(msg);

    return NextResponse.json({
      ok: true,
      message: msg,
      effect: {
        action: parsed.action,
        sku: parsed.sku,
        warehouse,
        qty: parsed.qty,
      },
    });
  } catch (err) {
    console.error("API /api/webhook/zalo lỗi:", err);
    return NextResponse.json({ ok: false, error: "Không ghi được dữ liệu" }, { status: 500 });
  }
}
