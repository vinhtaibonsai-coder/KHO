import { NextResponse } from "next/server";
import { addQty, pushMessage, removeItem, upsertItem, findItem, transferItem, ensureWarehouseExists, recordBotPing } from "@/lib/store";
import { validateSku, extractValidSkusFromText } from "@/lib/sku-rules";
import type { ZaloMessage } from "@/types";
import { verifyWebhookSignature } from "@/lib/webhook-signature";

export const dynamic = "force-dynamic";

function parseWarehouse(groupId: string): number | null {
  const m = groupId.match(/(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 100 ? n : null;
}

// Bóc tách cú pháp chuyển kho: CK E120.124 -> 5, CHUYEN E120.124 QUA KHO 5, CK E120.124 KHO 5, v.v.
function parseTransferCommand(text: string): { sku: string; toWarehouse: number } | null {
  const clean = text.trim();
  // Khớp các mẫu:
  // 1. CK E120.124 5  hoặc  CK E120.124 K5  hoặc  CK E120.124 KHO 5
  // 2. CK E120.124 -> 5  hoặc  CK E120.124 > 5
  // 3. CHUYEN E120.124 QUA KHO 5  hoặc  CHUYEN E120.124 SANG KHO 5
  const m = clean.match(/^(?:CK|CHUYEN|CHUYENKHO)\s+([A-Za-z0-9.]+)\s*(?:->|>|QUA|SANG|DEN|TO)?\s*(?:KHO|K)?\s*(\d{1,3})$/i);
  if (!m) return null;

  const rawSku = m[1].trim();
  const toWh = parseInt(m[2], 10);

  const val = validateSku(rawSku);
  const sku = val.valid ? val.normalizedSku : rawSku.toUpperCase();

  if (toWh < 1) return null;
  return { sku, toWarehouse: toWh };
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
  const rawBody = await req.text();
  if (!verifyWebhookSignature(
    rawBody,
    req.headers.get("x-zalo-timestamp"),
    req.headers.get("x-zalo-signature"),
    process.env.ZALO_WEBHOOK_SECRET
  )) {
    return NextResponse.json({ ok: false, error: "Webhook không hợp lệ" }, { status: 401 });
  }
  const body = (() => { try { return JSON.parse(rawBody); } catch { return null; } })();

  // Nhận tín hiệu heartbeat giữ trạng thái bot online
  if (body?.action === "heartbeat" || body?.message === "__PING__") {
    const pingTime = await recordBotPing();
    return NextResponse.json({ ok: true, heartbeat: true, timestamp: pingTime });
  }

  if (!body?.groupId || !body?.message) {
    return NextResponse.json({ ok: false, error: "Thiếu groupId hoặc message" }, { status: 400 });
  }

  try {
    // 0. XỬ LÝ LỆNH CHUYỂN KHO (Có thể gửi từ My Documents hoặc bất kỳ đâu)
    const transferCmd = parseTransferCommand(body.message);
    if (transferCmd) {
      const { sku, toWarehouse } = transferCmd;
      const result = await transferItem(sku, toWarehouse, "Chuyển kho qua tin nhắn Zalo");

      const msg: ZaloMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        groupId: body.groupId,
        warehouse: toWarehouse,
        message: body.message,
        status: result.success ? "ok" : "error",
        detail: result.success
          ? `Đã chuyển mã [${sku}] từ Kho ${result.fromWarehouse} sang Kho ${toWarehouse} thành công!`
          : (result.error || "Không thể chuyển kho"),
        createdAt: new Date().toISOString(),
      };
      await pushMessage(msg);

      return NextResponse.json({
        ok: result.success,
        isTransfer: true,
        message: msg,
        sku,
        fromWarehouse: result.fromWarehouse,
        toWarehouse,
        error: result.error,
      }, { status: result.success ? 200 : 400 });
    }
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

    // Tự động tạo thêm kho trên web và database nếu nhóm Zalo này là kho mới (VD: Kho 31, Kho 32...)
    await ensureWarehouseExists(warehouse);

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
