"use client";

import { useMemo, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, MessageSquare, Send, Smartphone, Sparkles } from "lucide-react";
import type { Item, ZaloMessage } from "@/types";
import { extractValidSkusFromText } from "@/lib/sku-rules";

const QUICK = ["+E90.100", "+K100.101", "+S100.02", "+PT395", "+BC12"];
const pad = (n: number) => String(n).padStart(2, "0");

export default function ZaloSimulator({
  messages,
  onSend,
  items = [],
}: {
  messages: ZaloMessage[];
  onSend: (payload: { groupId: string; message: string }) => Promise<{ ok: boolean; message: ZaloMessage }>;
  items?: Item[];
}) {
  const [group, setGroup] = useState("KHO_05");
  const [text, setText] = useState("+E120.124");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ ok: boolean; text: string } | null>(null);

  // Số thứ tự kho hiện tại đang chọn trong dropdown
  const currentWarehouseNum = useMemo(() => {
    const match = group.match(/\d+/);
    return match ? Number(match[0]) : 5;
  }, [group]);

  // Kiểm tra cảnh báo trùng mã theo thời gian thực ngay khi gõ
  const duplicateCheck = useMemo(() => {
    const trimmed = text.trim();
    if (!trimmed) return null;

    // Nếu là lệnh xuất kho (bắt đầu bằng dấu -), không coi là trùng
    const isOut = trimmed.startsWith("-");
    if (isOut) return null;

    const { validSkus, details } = extractValidSkusFromText(trimmed);
    if (validSkus.length === 0) return null;

    const duplicates: { sku: string; existingWarehouse: number }[] = [];
    const itemMap = new Map<string, number>();
    for (const it of items) {
      itemMap.set(it.sku, it.warehouse);
    }

    for (const sku of validSkus) {
      const wh = itemMap.get(sku);
      if (wh !== undefined && wh !== currentWarehouseNum) {
        duplicates.push({ sku, existingWarehouse: wh });
      }
    }

    return {
      totalFound: validSkus.length,
      duplicates,
      hasDuplicates: duplicates.length > 0,
    };
  }, [text, items, currentWarehouseNum]);

  async function send(preset?: string) {
    const message = (preset ?? text).trim();
    if (!message) return;
    setBusy(true);
    try {
      const data = await onSend({ groupId: group, message });
      setLast({
        ok: data.ok,
        text: data.ok ? `Thành công: ${data.message.detail}` : `Lỗi: ${data.message.detail}`,
      });
    } catch {
      setLast({ ok: false, text: "Lỗi kết nối tới webhook" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 font-bold text-xs border border-blue-200">
            Z
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 tracking-tight">
              Mô Phỏng Nhận Tin Nhắn Từ 30 Nhóm Zalo
            </h2>
            <p className="text-xs text-slate-500">Giả lập tin nhắn công nhân gửi để kiểm tra hệ thống gán kho tự động</p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          Webhook Sẵn Sàng
        </span>
      </div>

      {/* FORM GỬI TIN */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          aria-label="Chọn nhóm Zalo"
          className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 font-medium text-xs text-slate-800 outline-none focus:border-emerald-500 focus:bg-white"
        >
          {Array.from({ length: 30 }, (_, i) => i + 1).map((w) => (
            <option key={w} value={`KHO_${pad(w)}`}>
              Nhóm Zalo: Kho {pad(w)}
            </option>
          ))}
        </select>

        <div className="relative flex-1">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Nhập tin nhắn (VD: +E120.124 hoặc -E80.345)..."
            aria-label="Nội dung tin nhắn"
            className={`w-full rounded-xl border px-4 py-2.5 font-mono text-xs font-bold outline-none transition uppercase ${
              duplicateCheck?.hasDuplicates
                ? "border-rose-400 bg-rose-50/60 text-rose-950 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
                : "border-slate-200 bg-slate-50/70 text-slate-800 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/10"
            }`}
          />
        </div>

        <button
          type="button"
          onClick={() => send()}
          disabled={busy}
          className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-xs transition active:scale-95 disabled:opacity-50 cursor-pointer ${
            duplicateCheck?.hasDuplicates
              ? "bg-rose-600 hover:bg-rose-700"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          <Send className="h-3.5 w-3.5" />
          Gửi tin
        </button>
      </div>

      {/* CẢNH BÁO TRÙNG MÃ THỜI GIAN THỰC NGAY KHI GÕ */}
      {duplicateCheck?.hasDuplicates && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50 p-3.5 text-xs text-rose-800 shadow-2xs animate-in fade-in duration-150">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-extrabold text-rose-900 uppercase tracking-wide">
              ⚠️ CẢNH BÁO TRÙNG MÃ HÀNG ĐỘC BẢN:
            </p>
            <p className="font-medium text-rose-800">
              Có <strong className="font-bold text-rose-950">{duplicateCheck.duplicates.length}</strong> mã bạn đang gõ đã tồn tại ở kho khác:
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {duplicateCheck.duplicates.map((d) => (
                <span
                  key={d.sku}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-2.5 py-1 font-mono text-xs font-black text-rose-900 shadow-2xs"
                >
                  <span>{d.sku}</span>
                  <span className="text-[10px] font-bold text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded">
                    đang ở Kho {pad(d.existingWarehouse)}
                  </span>
                </span>
              ))}
            </div>
            <p className="text-[11px] text-rose-600 italic pt-0.5">
              * Nếu gửi vào nhóm <strong>{group}</strong>, hệ thống sẽ tự động từ chối để bảo vệ tính độc bản 1-1.
            </p>
          </div>
        </div>
      )}

      {/* NÚT BẤM NHANH */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-xs text-slate-400 font-medium">Mẫu nhanh:</span>
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => send(q)}
            disabled={busy}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-600 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 transition disabled:opacity-50 cursor-pointer"
          >
            {q}
          </button>
        ))}
      </div>

      {/* THÔNG BÁO KẾT QUẢ VỪA GỬI */}
      {last && (
        <div
          className={`rounded-xl p-3 text-xs font-medium border ${
            last.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {last.text}
        </div>
      )}

      {/* NHẬT KÝ TIN NHẮN TỪ ZALO */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5 space-y-2">
        <div className="flex items-center justify-between text-xs font-bold text-slate-600">
          <span className="uppercase tracking-wider">Lịch sử nhận tin ({messages.length})</span>
          <span className="text-[11px] text-slate-400 font-normal">Tự động bắt từ 30 nhóm</span>
        </div>

        {messages.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">Chưa có tin nhắn nào được gửi đến.</p>
        ) : (
          <ul className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {messages.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-2.5 border border-slate-200/80 text-xs shadow-2xs"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                    {m.groupId}
                  </span>
                  <span className="font-mono font-bold text-slate-800">{m.message}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`font-medium text-[11px] ${
                      m.status === "ok" ? "text-emerald-700" : "text-rose-600"
                    }`}
                  >
                    {m.detail}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">
                    {new Date(m.createdAt).toLocaleTimeString("vi-VN")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
